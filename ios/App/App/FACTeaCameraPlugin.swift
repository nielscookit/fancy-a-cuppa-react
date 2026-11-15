import AVFoundation
import Capacitor
import UIKit
import VisionKit
import CoreText

@objc(FACTeaCameraPlugin)
final class FACTeaCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACTeaCameraPlugin"
    let jsName = "FACTeaCamera"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBarcodeResult", returnType: CAPPluginReturnPromise)
    ]
    private weak var camera: UIViewController?
    private var opening = false

    @objc func open(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 16.0, *), DataScannerViewController.isSupported else {
                call.reject("Live scanning is unavailable on this iPhone.")
                return
            }
            guard camera == nil, !opening else {
                call.reject("The camera is already open.")
                return
            }
            opening = true
            defer { opening = false }
            guard await AVCaptureDevice.requestAccess(for: .video) else {
                call.reject("Allow camera access for Fancy a Cuppa in Settings.")
                return
            }
            guard DataScannerViewController.isAvailable,
                  let presenter = bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("The camera is currently unavailable.")
                return
            }
            let controller = FACTeaCameraViewController { [weak self] id, text, format in
                self?.notifyListeners("barcode", data: ["id": id, "text": text, "format": format])
            } onClose: { result in
                call.resolve(["action": result])
            }
            camera = controller
            controller.modalPresentationStyle = .fullScreen
            presenter.present(controller, animated: true)
        }
    }

    @objc func showBarcodeResult(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.0, *), let controller = camera as? FACTeaCameraViewController {
                controller.showBarcodeResult(id: call.getString("id"), result: call.getString("result"))
            }
            call.resolve()
        }
    }
}

@available(iOS 16.0, *)
private final class FACTeaCameraViewController: UIViewController, DataScannerViewControllerDelegate {
    private let scanner = DataScannerViewController(
        recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8])],
        qualityLevel: .balanced, recognizesMultipleItems: true,
        isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
        isGuidanceEnabled: false, isHighlightingEnabled: false
    )
    private let onBarcode: (String, String, String) -> Void
    private let onClose: (String) -> Void
    private let charcoal = UIColor(red: 27/255, green: 39/255, blue: 43/255, alpha: 1)
    private let lime = UIColor(red: 185/255, green: 252/255, blue: 105/255, alpha: 1)
    private let finder = UIView()
    private let close = UIButton(type: .custom)
    private let shutter = UIButton(type: .custom)
    private let shutterDisc = UIView()
    private let identify = UIButton(type: .custom)
    private let add = UIButton(type: .custom)
    private let thumbnails = UIScrollView()
    private let strip = UIStackView()
    private let toast = UIStackView()
    private let toastIcon = UIImageView()
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private var seen = Set<String>()
    private var visibleBarcodeIDs: [UUID: String] = [:]
    private var candidateID: String?
    private var capture: Task<Void, Never>?
    private var processing: Task<Void, Never>?
    private var toastDismissTask: Task<Void, Never>?
    private var closed = false
    private enum Result { case none, known, possible, noMatch }
    private var result = Result.none

    init(onBarcode: @escaping (String, String, String) -> Void, onClose: @escaping (String) -> Void) {
        self.onBarcode = onBarcode
        self.onClose = onClose
        super.init(nibName: nil, bundle: nil)
    }

    required init?(coder: NSCoder) { return nil }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10/255, green: 14/255, blue: 16/255, alpha: 1)
        addChild(scanner)
        view.addSubview(scanner.view)
        scanner.didMove(toParent: self)
        scanner.delegate = self
        scanner.view.layer.cornerRadius = 30
        scanner.view.layer.maskedCorners = [.layerMinXMinYCorner, .layerMaxXMinYCorner]
        scanner.view.clipsToBounds = true

        let overlay = scanner.overlayContainerView
        finder.layer.borderColor = lime.cgColor
        finder.layer.borderWidth = 3
        finder.layer.cornerRadius = 12
        finder.isUserInteractionEnabled = false
        overlay.addSubview(finder)
        close.backgroundColor = charcoal.withAlphaComponent(0.8)
        close.tintColor = .white
        close.setImage(UIImage(systemName: "xmark"), for: .normal)
        close.accessibilityLabel = "Close camera"
        close.layer.cornerRadius = 24
        close.addTarget(self, action: #selector(closeCamera), for: .touchUpInside)
        // The native close button must receive touches above the VisionKit view.
        view.addSubview(close)

        strip.spacing = 16
        strip.translatesAutoresizingMaskIntoConstraints = false
        thumbnails.addSubview(strip)
        NSLayoutConstraint.activate([
            strip.leadingAnchor.constraint(equalTo: thumbnails.contentLayoutGuide.leadingAnchor),
            strip.trailingAnchor.constraint(equalTo: thumbnails.contentLayoutGuide.trailingAnchor),
            strip.topAnchor.constraint(equalTo: thumbnails.contentLayoutGuide.topAnchor),
            strip.bottomAnchor.constraint(equalTo: thumbnails.contentLayoutGuide.bottomAnchor),
            strip.heightAnchor.constraint(equalTo: thumbnails.frameLayoutGuide.heightAnchor)
        ])
        overlay.addSubview(thumbnails)
        configureToast()
        overlay.addSubview(toast)

        shutter.layer.borderWidth = 1
        shutter.layer.borderColor = UIColor.white.cgColor
        shutter.layer.cornerRadius = 35
        shutterDisc.backgroundColor = .white
        shutterDisc.layer.cornerRadius = 31
        shutterDisc.isUserInteractionEnabled = false
        shutterDisc.frame = CGRect(x: 4, y: 4, width: 62, height: 62)
        shutter.addSubview(shutterDisc)
        shutter.accessibilityLabel = "Take photo"
        shutter.addTarget(self, action: #selector(takePhoto), for: .touchUpInside)
        view.addSubview(shutter)
        for button in [identify, add] {
            button.backgroundColor = UIColor(red: 243/255, green: 242/255, blue: 240/255, alpha: 1)
            button.setTitleColor(charcoal, for: .normal)
            button.titleLabel?.font = mono(16, weight: .semibold)
            button.layer.cornerRadius = 33
            view.addSubview(button)
        }
        identify.addTarget(self, action: #selector(identifyTea), for: .touchUpInside)
        add.setTitle("ADD NEW", for: .normal)
        add.addTarget(self, action: #selector(addTea), for: .touchUpInside)
        NotificationCenter.default.addObserver(self, selector: #selector(stopScanner),
                                               name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(startScanner),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        updateActions()
    }

    private func mono(_ size: CGFloat, weight: UIFont.Weight) -> UIFont {
        let name = weight == .regular ? "RobotoMono-Regular" : "RobotoMono-Medium"
        if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return UIFont(name: name, size: size) ?? .monospacedSystemFont(ofSize: size, weight: weight)
    }

    private func configureToast() {
        toast.spacing = 16
        toast.alignment = .center
        toast.backgroundColor = charcoal.withAlphaComponent(0.8)
        toast.layer.cornerRadius = 15
        toast.isLayoutMarginsRelativeArrangement = true
        toast.layoutMargins = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
        toastIcon.tintColor = lime
        toastIcon.contentMode = .scaleAspectFit
        toastIcon.widthAnchor.constraint(equalToConstant: 24).isActive = true
        let labels = UIStackView(arrangedSubviews: [titleLabel, detailLabel])
        labels.axis = .vertical
        labels.spacing = 3
        titleLabel.font = mono(12, weight: .medium)
        detailLabel.font = mono(10, weight: .regular)
        for label in [titleLabel, detailLabel] { label.textColor = .white }
        toast.addArrangedSubview(toastIcon)
        toast.addArrangedSubview(labels)
        toast.isHidden = true
        toast.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(useKnownTea)))
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = view.bounds.width
        let height = view.bounds.height
        let top = max(52, view.safeAreaInsets.top)
        let cameraHeight = max(120, height - top - 264)
        scanner.view.frame = CGRect(x: 0, y: top, width: width, height: cameraHeight)
        finder.frame = CGRect(x: (width - 189) / 2, y: cameraHeight * 152 / 496, width: 189, height: 116)
        scanner.regionOfInterest = finder.frame
        close.frame = CGRect(x: width - 62, y: top + 14, width: 48, height: 48)
        thumbnails.frame = CGRect(x: 16, y: cameraHeight - 73, width: width - 32, height: 66)
        let toastBottom: CGFloat = strip.arrangedSubviews.isEmpty ? 16 : 96
        toast.frame = CGRect(x: 12, y: cameraHeight - toastBottom - 56, width: width - 24, height: 56)
        shutter.frame = CGRect(x: (width - 70) / 2, y: top + cameraHeight + 16, width: 70, height: 70)
        identify.frame = CGRect(x: 8, y: height - 80, width: width - 16, height: 66)
        add.frame = identify.frame.offsetBy(dx: 0, dy: -82)
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        startScanner()
    }

    override func viewWillDisappear(_ animated: Bool) {
        super.viewWillDisappear(animated)
        stopScanner()
    }

    @objc private func startScanner() {
        guard !closed, view.window != nil, !scanner.isScanning else { return }
        do { try scanner.startScanning() }
        catch { showToast("Camera unavailable", error.localizedDescription, found: false) }
        updateActions()
    }

    @objc private func stopScanner() {
        scanner.stopScanning()
        capture?.cancel()
        updateActions()
    }

    func dataScanner(_ dataScanner: DataScannerViewController,
                     becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        showToast("Camera unavailable", "Close and reopen the camera to try again.", found: false)
        stopScanner()
    }

    func dataScanner(_ dataScanner: DataScannerViewController,
                     didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        guard !closed, processing == nil, result != .possible, result != .noMatch else { return }
        for item in addedItems {
            guard case .barcode(let barcode) = item else { continue }
            let code = barcode.payloadStringValue ?? ""
            let format = barcode.observation.symbology == .ean8 ? "EAN8" : "EAN13"
            // Vision presents UPC-A as zero-prefixed EAN-13.
            let key = code.isEmpty ? barcode.id.uuidString : code
            visibleBarcodeIDs[barcode.id] = key
            guard seen.insert(key).inserted else { continue }
            let id = UUID().uuidString
            candidateID = id
            onBarcode(id, code, format)
            return
        }
    }

    func dataScanner(_ dataScanner: DataScannerViewController,
                     didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        // Re-enable a barcode only after its last visible instance has left.
        for item in removedItems {
            guard let key = visibleBarcodeIDs.removeValue(forKey: item.id) else { continue }
            if !visibleBarcodeIDs.values.contains(key) { seen.remove(key) }
        }
    }

    func showBarcodeResult(id: String?, result value: String?) {
        guard !closed, let id, id == candidateID, processing == nil else { return }
        candidateID = nil
        result = value == "known" ? .known : .none
        switch value {
        case "known": showToast("Tea Found", "Fancy a cuppa", found: true)
        case "unknown": showToast("Tea Not Found", "No tea linked to this code.", found: false, autoDismiss: true)
        default: showToast("Barcode Not Readable", "Try again or identify by photo.", found: false, autoDismiss: true)
        }
    }

    private func showToast(_ title: String, _ detail: String, found: Bool, autoDismiss: Bool = false) {
        toastDismissTask?.cancel()
        toastDismissTask = nil
        titleLabel.text = title
        detailLabel.text = detail
        toastIcon.tintColor = found ? lime : UIColor(red: 1, green: 145/255, blue: 83/255, alpha: 1)
        toastIcon.image = UIImage(systemName: found ? "checkmark" : "exclamationmark.triangle")
        toast.isHidden = false
        view.setNeedsLayout()
        if autoDismiss {
            toastDismissTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 2_500_000_000)
                guard !Task.isCancelled, let self, !self.closed else { return }
                self.toast.isHidden = true
                self.toastDismissTask = nil
            }
        }
    }

    @objc private func takePhoto() {
        guard !closed, scanner.isScanning, capture == nil, processing == nil else { return }
        toastDismissTask?.cancel()
        toastDismissTask = nil
        toast.isHidden = true
        capture = Task { @MainActor in
            defer { capture = nil; updateActions() }
            do {
                let photo = try await scanner.capturePhoto()
                guard !Task.isCancelled, !closed else { return }
                let size = CGSize(width: 132, height: 132)
                let thumbnail = UIGraphicsImageRenderer(size: size).image { _ in
                    let scale = max(size.width / photo.size.width, size.height / photo.size.height)
                    let w = photo.size.width * scale
                    let h = photo.size.height * scale
                    photo.draw(in: CGRect(x: (size.width - w) / 2, y: (size.height - h) / 2, width: w, height: h))
                }
                let image = UIImageView(image: thumbnail)
                image.accessibilityLabel = "Photo \(strip.arrangedSubviews.count + 1)"
                image.isAccessibilityElement = true
                image.widthAnchor.constraint(equalToConstant: 66).isActive = true
                strip.addArrangedSubview(image)
                if result == .possible || result == .noMatch {
                    result = .none
                    toast.isHidden = true
                }
                view.setNeedsLayout()
                view.layoutIfNeeded()
                thumbnails.setContentOffset(CGPoint(x: max(0, thumbnails.contentSize.width - thumbnails.bounds.width), y: 0), animated: true)
            } catch {
                guard !Task.isCancelled, !closed else { return }
                showToast("Photo unavailable", "Try taking the photo again.", found: false)
            }
        }
        updateActions()
    }

    @objc private func identifyTea() {
        if result == .possible { finish("use"); return }
        if result == .noMatch { addTea(); return }
        guard !strip.arrangedSubviews.isEmpty, capture == nil, processing == nil else { return }
        candidateID = nil
        toast.isHidden = true
        processing = Task { @MainActor in
            try? await Task.sleep(nanoseconds: 650_000_000)
            guard !Task.isCancelled, !closed else { return }
            processing = nil
            if strip.arrangedSubviews.count > 1 {
                result = .possible
                showToast("Possible match", "Assam Breakfast TeeGschwendner", found: true)
            } else {
                result = .noMatch
                showToast("No Match Found", "Take more photos or add a new tea.", found: false)
            }
            updateActions()
        }
        updateActions()
    }

    private func updateActions() {
        shutter.isEnabled = !closed && scanner.isScanning && capture == nil && processing == nil
        identify.isEnabled = !closed && !strip.arrangedSubviews.isEmpty && capture == nil && processing == nil
        identify.alpha = identify.isEnabled ? 1 : 0.35
        identify.setTitle(result == .possible ? "USE THIS TEA" : result == .noMatch ? "ADD NEW"
                          : processing == nil ? "IDENTIFY TEA" : "IDENTIFYING TEA", for: .normal)
        add.isHidden = result != .possible
    }

    @objc private func useKnownTea() { if result == .known { finish("use") } }
    @objc private func addTea() { finish("add") }
    @objc private func closeCamera() { finish("close") }

    private func finish(_ action: String) {
        guard !closed else { return }
        closed = true
        toastDismissTask?.cancel()
        toastDismissTask = nil
        stopScanner()
        processing?.cancel()
        scanner.delegate = nil
        NotificationCenter.default.removeObserver(self)
        strip.arrangedSubviews.forEach { $0.removeFromSuperview() }
        dismiss(animated: true) { [onClose] in onClose(action) }
    }
}
