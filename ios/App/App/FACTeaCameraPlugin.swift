import AVFoundation
import Capacitor
import UIKit
import VisionKit
import Vision
import CoreText

@objc(FACTeaCameraPlugin)
final class FACTeaCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACTeaCameraPlugin"
    let jsName = "FACTeaCamera"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "open", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "closeForQuickAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showBarcodeResult", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showPhotoResult", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reportOCRDiagnostic", returnType: CAPPluginReturnPromise)
    ]
    private weak var camera: UIViewController?
    private var opening = false
    private var cancelOpening = false

    @objc func open(_ call: CAPPluginCall) {
        Task { @MainActor in
            guard #available(iOS 16.0, *) else {
                call.reject("Live scanning is unavailable on this iPhone.")
                return
            }
            guard camera == nil, !opening else {
                call.reject("The camera is already open.")
                return
            }
            opening = true
            cancelOpening = false
            defer { opening = false }
            let granted = await AVCaptureDevice.requestAccess(for: .video)
            if cancelOpening {
                call.resolve(["action": "close", "photos": []])
                return
            }
            guard let presenter = bridge?.viewController, presenter.presentedViewController == nil else {
                call.reject("The camera is currently unavailable.")
                return
            }
            let barcodeOnly = call.getString("mode") == "barcode"
            var capturedBarcode: [String: String]?
            let controller = FACTeaCameraViewController(barcodeOnly: barcodeOnly, cameraAvailable: granted && DataScannerViewController.isSupported && DataScannerViewController.isAvailable) { [weak self] id, text, format in
                if barcodeOnly {
                    capturedBarcode = ["text": text, "format": format]
                } else {
                    self?.notifyListeners("barcode", data: ["id": id, "text": text, "format": format])
                }
            } onPhotoText: { [weak self] id, lines, diagnostic in
                var event: [String: Any] = ["id": id, "lines": lines]
                if let diagnostic { event["ocrDiagnostic"] = diagnostic }
                self?.notifyListeners("photoText", data: event)
            } onState: { [weak self] reason in
                self?.notifyListeners("cameraState", data: ["reason": reason])
            } onClose: { result, photos, barcodeID, photoID, teaID in
                var response: [String: Any] = ["action": result, "photos": photos]
                if result == "barcode", let capturedBarcode { response["barcode"] = capturedBarcode }
                if let barcodeID { response["barcodeID"] = barcodeID }
                if let photoID { response["photoID"] = photoID }
                if let teaID { response["teaID"] = teaID }
                call.resolve(response)
            }
            camera = controller
            controller.modalPresentationStyle = .fullScreen
            presenter.present(controller, animated: true)
        }
    }

    @objc func closeForQuickAccess(_ call: CAPPluginCall) {
        Task { @MainActor in
            cancelOpening = opening
            if #available(iOS 16.0, *), let controller = camera as? FACTeaCameraViewController {
                controller.closeForQuickAccess()
            }
            call.resolve()
        }
    }

    @objc func showBarcodeResult(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.0, *), let controller = camera as? FACTeaCameraViewController {
                controller.showBarcodeResult(id: call.getString("id"), result: call.getString("result"), name: call.getString("name"), brand: call.getString("brand"))
            }
            call.resolve()
        }
    }

    @objc func showPhotoResult(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.0, *), let controller = camera as? FACTeaCameraViewController {
                controller.showPhotoResult(id: call.getString("id"),
                                           result: call.getString("result"),
                                           candidates: (call.getArray("candidates") as? [[String: String]]) ?? [])
            }
            call.resolve()
        }
    }
    @objc func reportOCRDiagnostic(_ call: CAPPluginCall) {
        Task { @MainActor in
            if #available(iOS 16.0, *), let controller = camera as? FACTeaCameraViewController {
                controller.reportOCRDiagnostic(id: call.getString("id"), payload: call.getObject("report"))
            }
            call.resolve()
        }
    }

}

// The native session owns accepted lookup IDs. React may return late results,
// but only a result for the current revision can change navigation or form data.
@available(iOS 16.0, *)
private final class FACTeaCameraViewController: UIViewController, DataScannerViewControllerDelegate {
    private let scanner: DataScannerViewController?
    private let barcodeOnly: Bool
    private let onBarcode: (String, String, String) -> Void
    private let onPhotoText: (String, [String], [String: Any]?) -> Void
    private let onState: (String) -> Void
    private let onClose: (String, [String], String?, String?, String?) -> Void
    private let charcoal = UIColor(red: 27/255, green: 39/255, blue: 43/255, alpha: 1)
    private let lime = UIColor(red: 185/255, green: 252/255, blue: 105/255, alpha: 1)
    private let finder = UIImageView()
    private let close = UIButton(type: .custom)
    private let manual = UIButton(type: .custom)
    private let manualLabel = UILabel()
    private let manualArrow = UIImageView()
    private var manualExpanded = false
    private var manualOpening = false
    private var manualCollapseTask: Task<Void, Never>?
    private let shutter = UIButton(type: .custom)
    private let shutterDisc = UIView()
    private let action = UIButton(type: .custom)
    private let trash = UIButton(type: .custom)
    private let thumbnails = UIScrollView()
    private let strip = UIStackView()
    private let candidateScroll = UIScrollView()
    private let candidateRows = UIStackView()
    private let toast = UIStackView()
    private let toastIcon = UIImageView()
    private let titleLabel = UILabel()
    private let detailLabel = UILabel()
    private let hint = UIStackView()
    private let hintIcon = UIImageView()
    private let hintLabel = UILabel()
    private let cameraSurface = UIView()
    private var photos: [(image: UIImage, preview: String)] = []
    private var selectedPhoto = 0
    private var hasCapturedPhoto = false
    private var diagnosticPhotoID: String?
    private var diagnosticEpoch = 0
    private var photoRevision = 0
    private var photoLookupID: String?
    private var acceptedPhotoID: String?
    private var acceptedBarcodeID: String?
    private var selectedTeaID: String?
    private var candidateID: String?
    private var candidates: [[String: String]] = []
    private var seen = Set<String>()
    private var visibleBarcodeIDs: [UUID: String] = [:]
    private var capture: Task<Void, Never>?
    private var processing: Task<Void, Never>?
    private var photoLookupTimeout: Task<Void, Never>?
    private var barcodeNavigation: Task<Void, Never>?
    private var cameraActive = false
    private var closed = false
    private var cameraUnavailable: Bool
    private enum State { case barcode, knownBarcode, unknownBarcode, unreadableBarcode, photo, identifying, unreadablePhoto, matches, noMatch, networkError }
    private var state = State.barcode

    init(barcodeOnly: Bool, cameraAvailable: Bool,
         onBarcode: @escaping (String, String, String) -> Void,
         onPhotoText: @escaping (String, [String], [String: Any]?) -> Void, onState: @escaping (String) -> Void,
         onClose: @escaping (String, [String], String?, String?, String?) -> Void) {
        self.barcodeOnly = barcodeOnly
        self.onBarcode = onBarcode
        self.onPhotoText = onPhotoText
        self.onState = onState
        self.onClose = onClose
        self.cameraUnavailable = !cameraAvailable
        self.scanner = cameraAvailable ? DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: [.ean13, .ean8])],
            qualityLevel: .balanced, recognizesMultipleItems: true,
            isHighFrameRateTrackingEnabled: false, isPinchToZoomEnabled: true,
            isGuidanceEnabled: false, isHighlightingEnabled: false
        ) : nil
        super.init(nibName: nil, bundle: nil)
    }
    required init?(coder: NSCoder) { return nil }
    override var prefersStatusBarHidden: Bool { true }

    // These PNGs are transparent @3x exports of the approved Figma vectors.
    // Capacitor copies public/figma; no personal Xcode project edit is needed.
    private func icon(_ name: String) -> UIImage? {
        guard let url = Bundle.main.url(forResource: name, withExtension: "png", subdirectory: "public/figma"),
              let image = UIImage(contentsOfFile: url.path), let cgImage = image.cgImage else { return nil }
        return UIImage(cgImage: cgImage, scale: 3, orientation: .up)
    }
    private func mono(_ size: CGFloat, weight: UIFont.Weight = .regular) -> UIFont {
        let name = weight == .regular ? "RobotoMono-Regular" : "RobotoMono-Medium"
        if let url = Bundle.main.url(forResource: name, withExtension: "ttf") {
            CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
        }
        return UIFont(name: name, size: size) ?? .monospacedSystemFont(ofSize: size, weight: weight)
    }
    private func roundControl(_ button: UIButton, icon name: String, label: String, selector: Selector) {
        button.backgroundColor = name == "uc02-close" ? .clear : charcoal.withAlphaComponent(0.8)
        button.layer.cornerRadius = 24
        button.setImage(name == "uc02-delete" ? icon(name)?.withRenderingMode(.alwaysTemplate) : icon(name), for: .normal)
        button.tintColor = .white
        button.accessibilityLabel = label
        button.addTarget(self, action: selector, for: .touchUpInside)
        view.addSubview(button)
    }
    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = UIColor(red: 10/255, green: 14/255, blue: 16/255, alpha: 1)
        cameraSurface.backgroundColor = UIColor(red: 16/255, green: 23/255, blue: 25/255, alpha: 1)
        cameraSurface.layer.cornerRadius = 30
        cameraSurface.clipsToBounds = true
        view.addSubview(cameraSurface)
        if let scanner {
            addChild(scanner)
            cameraSurface.addSubview(scanner.view)
            scanner.didMove(toParent: self)
            scanner.delegate = self
        }
        finder.image = icon("uc02-scan-corners")?.resizableImage(
            withCapInsets: UIEdgeInsets(top: 44, left: 40, bottom: 44, right: 40), resizingMode: .stretch)
        finder.isUserInteractionEnabled = false
        cameraSurface.addSubview(finder)
        roundControl(close, icon: "uc02-close", label: "Close camera", selector: #selector(closeCamera))
        roundControl(manual, icon: "uc02-manual", label: "Add tea manually", selector: #selector(openManualShortcut))
        manual.setImage(nil, for: .normal)
        manualLabel.text = "ADD NEW TEA"
        manualLabel.font = mono(15, weight: .medium)
        manualLabel.textColor = .white
        manualLabel.isUserInteractionEnabled = false
        manualArrow.image = icon("uc02-manual")
        manualArrow.isUserInteractionEnabled = false
        manual.addSubview(manualLabel)
        manual.addSubview(manualArrow)
        manual.clipsToBounds = true
        manual.addTarget(self, action: #selector(cancelManualShortcut), for: [.touchCancel, .touchUpOutside])
        roundControl(trash, icon: "uc02-delete", label: "Delete selected photo", selector: #selector(deletePhoto))
        strip.spacing = 8
        thumbnails.addSubview(strip)
        view.addSubview(thumbnails)
        candidateRows.axis = .vertical
        candidateRows.layer.cornerRadius = 30
        candidateRows.clipsToBounds = true
        candidateScroll.addSubview(candidateRows)
        view.addSubview(candidateScroll)
        toast.spacing = 8
        toast.alignment = .center
        toast.backgroundColor = charcoal.withAlphaComponent(0.8)
        toast.layer.cornerRadius = 24
        toast.isLayoutMarginsRelativeArrangement = true
        toast.layoutMargins = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        toastIcon.contentMode = .scaleAspectFit
        toastIcon.widthAnchor.constraint(equalToConstant: 24).isActive = true
        toastIcon.heightAnchor.constraint(equalToConstant: 24).isActive = true
        let labels = UIStackView(arrangedSubviews: [titleLabel, detailLabel])
        labels.axis = .vertical
        titleLabel.font = mono(12)
        detailLabel.font = mono(12)
        for label in [titleLabel, detailLabel] { label.textColor = .white; label.numberOfLines = 0 }
        toast.addArrangedSubview(toastIcon)
        toast.addArrangedSubview(labels)
        view.addSubview(toast)
        hint.spacing = 8
        hint.alignment = .center
        hint.isLayoutMarginsRelativeArrangement = true
        hint.layoutMargins = UIEdgeInsets(top: 0, left: 16, bottom: 0, right: 16)
        hintIcon.contentMode = .scaleAspectFit
        hintIcon.widthAnchor.constraint(equalToConstant: 24).isActive = true
        hintIcon.heightAnchor.constraint(equalToConstant: 24).isActive = true
        hint.addArrangedSubview(hintIcon)
        hint.addArrangedSubview(hintLabel)
        hintLabel.font = mono(15, weight: .medium)
        hintLabel.textColor = .white
        hint.backgroundColor = charcoal.withAlphaComponent(0.8)
        hint.layer.cornerRadius = 24
        hint.clipsToBounds = true
        hintLabel.adjustsFontSizeToFitWidth = true
        view.addSubview(hint)
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
        action.backgroundColor = charcoal
        action.setTitleColor(.white, for: .normal)
        action.titleLabel?.font = mono(16, weight: .semibold)
        action.layer.cornerRadius = 33
        action.addTarget(self, action: #selector(primaryAction), for: .touchUpInside)
        view.addSubview(action)
        NotificationCenter.default.addObserver(self, selector: #selector(stopScanner),
                                               name: UIApplication.willResignActiveNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(startScanner),
                                               name: UIApplication.didBecomeActiveNotification, object: nil)
        render()
    }
    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        let width = view.bounds.width
        let height = view.bounds.height
        // Figma 375x812: camera 4/4/367/548; shutter y566;
        // result rows y556; primary action y732, bottom14. Compact heights scroll rows.
        let cameraHeight = max(220, height - 264)
        cameraSurface.frame = CGRect(x: 4, y: 4, width: width - 8, height: cameraHeight)
        scanner?.view.frame = cameraSurface.bounds
        let matching = state == .matches
        let hasPhotos = !photos.isEmpty
        // Figma coordinates describe the unobstructed canvas. Keep the three
        // real controls below the iPhone cutout; only the camera image is full bleed.
        let controlsTop = max(16, view.safeAreaInsets.top + 8)
        let finderTop = controlsTop + 56
        let finderBottom = cameraHeight - (hasPhotos ? (matching ? 86 : 142) : 68)
        let finderRect = CGRect(x: 8, y: finderTop, width: width - 24, height: max(80, finderBottom - finderTop))
        finder.frame = finderRect
        scanner?.regionOfInterest = finderRect
        close.frame = CGRect(x: width - 64, y: controlsTop, width: 48, height: 48)
        let manualWidth: CGFloat = manualExpanded ? 168 : 48
        manual.frame = CGRect(x: close.frame.minX - 12 - manualWidth, y: controlsTop, width: manualWidth, height: 48)
        manualArrow.frame = CGRect(x: manualWidth - 36, y: 12, width: 24, height: 24)
        manualLabel.frame = CGRect(x: 16, y: 0, width: max(0, manualWidth - 64), height: 48)
        manualLabel.alpha = manualExpanded ? 1 : 0
        trash.frame = CGRect(x: close.frame.minX - 120, y: controlsTop, width: 48, height: 48)
        trash.isHidden = photos.isEmpty || manualExpanded
        let thumbsY = cameraHeight - (matching ? 70 : 126)
        thumbnails.frame = CGRect(x: 12, y: thumbsY, width: width - 24, height: 66)
        strip.frame = CGRect(x: 0, y: 0, width: CGFloat(photos.count) * 74 - (hasPhotos ? 8 : 0), height: 66)
        thumbnails.contentSize = strip.bounds.size
        hint.frame = CGRect(x: 12, y: cameraHeight - 52, width: width - 24, height: 48)
        toast.frame = CGRect(x: max(12, (width - 247) / 2), y: cameraHeight * 0.45,
                             width: min(247, width - 24), height: detailLabel.isHidden ? 48 : 58)
        shutter.frame = CGRect(x: (width - 70) / 2, y: cameraHeight + 18, width: 70, height: 70)
        action.frame = CGRect(x: 8, y: height - 80, width: width - 16, height: 66)
        candidateScroll.frame = CGRect(x: 4, y: cameraHeight + 8, width: width - 8,
                                       height: max(0, height - 92 - cameraHeight))
        candidateRows.frame = CGRect(x: 0, y: 0, width: width - 8, height: CGFloat(candidates.count) * 82)
        candidateScroll.contentSize = candidateRows.bounds.size
    }
    override func viewDidAppear(_ animated: Bool) { super.viewDidAppear(animated); startScanner() }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); stopScanner() }
    @objc private func startScanner() {
        guard !closed, view.window != nil else { return }
        cameraActive = true
        if state == .knownBarcode { render(); scheduleBarcodeNavigation(); return }
        guard let scanner, !scanner.isScanning else { render(); return }
        do { try scanner.startScanning(); cameraUnavailable = false }
        catch { cameraUnavailable = true }
        render()
    }
    @objc private func stopScanner() {
        cameraActive = false
        diagnosticPhotoID = nil
        diagnosticEpoch += 1
        barcodeNavigation?.cancel()
        barcodeNavigation = nil
        cancelManualShortcut()
        scanner?.stopScanning()
        capture?.cancel()
        render()
    }
    func dataScanner(_ dataScanner: DataScannerViewController,
                     becameUnavailableWithError error: DataScannerViewController.ScanningUnavailable) {
        cameraUnavailable = true
        stopScanner()
    }
    func dataScanner(_ dataScanner: DataScannerViewController,
                     didAdd addedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        guard !closed, !manualOpening, state == .barcode || state == .unreadableBarcode,
              candidateID == nil, capture == nil, processing == nil else { return }
        for item in addedItems {
            guard case .barcode(let barcode) = item else { continue }
            let code = barcode.payloadStringValue ?? ""
            let format = barcode.observation.symbology == .ean8 ? "EAN8" : "EAN13"
            if barcodeOnly {
                guard code.utf8.count == (format == "EAN8" ? 8 : 13),
                      code.utf8.allSatisfy({ (48...57).contains($0) }) else { continue }
                onBarcode(barcode.id.uuidString, code, format)
                finish("barcode")
                return
            }
            let key = code.isEmpty ? barcode.id.uuidString : code
            visibleBarcodeIDs[barcode.id] = key
            guard seen.insert(key).inserted else { continue }
            let id = UUID().uuidString
            candidateID = id
            acceptedBarcodeID = nil
            onBarcode(id, code, format)
            render()
            return
        }
    }
    func dataScanner(_ dataScanner: DataScannerViewController,
                     didRemove removedItems: [RecognizedItem], allItems: [RecognizedItem]) {
        for item in removedItems {
            guard let key = visibleBarcodeIDs.removeValue(forKey: item.id) else { continue }
            if !visibleBarcodeIDs.values.contains(key) { seen.remove(key) }
        }
    }
    func showBarcodeResult(id: String?, result value: String?, name: String?, brand: String?) {
        guard !closed, !manualOpening, let id, id == candidateID, processing == nil else { return }
        // Retain the ID during an offline failure so its one online retry can be accepted.
        if value != "lookup_error" { candidateID = nil }
        acceptedBarcodeID = value == "known" || value == "unknown" ? id : nil
        switch value {
        case "known": state = .knownBarcode
        case "unknown": state = .unknownBarcode
        case "lookup_error": state = .networkError
        default: state = .unreadableBarcode
        }
        render()
        if state == .knownBarcode { scheduleBarcodeNavigation() }
    }
    private func scheduleBarcodeNavigation() {
        guard !closed, cameraActive, state == .knownBarcode, barcodeNavigation == nil,
              let id = acceptedBarcodeID else { return }
        // Brief readable Figma feedback; still one accepted scan and no extra tap.
        barcodeNavigation = Task { @MainActor [weak self] in
            try? await Task.sleep(nanoseconds: 700_000_000)
            guard !Task.isCancelled, let self, !self.closed, self.cameraActive,
                  self.state == .knownBarcode, self.acceptedBarcodeID == id else { return }
            self.barcodeNavigation = nil
            self.finish("use")
        }
    }
    private func invalidatePhotoLookup() {
        photoRevision += 1
        diagnosticPhotoID = nil
        processing?.cancel()
        processing = nil
        photoLookupTimeout?.cancel()
        photoLookupTimeout = nil
        photoLookupID = nil
        acceptedPhotoID = nil
        selectedTeaID = nil
        candidates = []
        onState("photos_changed")
    }
    @objc private func primaryAction() {
        guard !closed, !manualOpening, state != .knownBarcode,
              capture == nil, processing == nil, photoLookupID == nil else { return }
        switch state {
        case .barcode, .unreadableBarcode:
            candidateID = nil
            onState("mode_changed")
            state = .photo
        case .unknownBarcode, .photo, .unreadablePhoto:
            guard !hasCapturedPhoto else { return }
            candidateID = nil
            acceptedBarcodeID = nil
            seen.removeAll()
            visibleBarcodeIDs.removeAll()
            onState("mode_changed")
            state = .barcode
        case .matches:
            // Rejection is a decision, not a confirmed product prefill.
            invalidatePhotoLookup()
            state = .noMatch
        case .noMatch: addTea()
        default: return
        }
        render()
    }
    @objc private func takePhoto() {
        guard !closed, !manualOpening, state != .knownBarcode, let scanner, scanner.isScanning, capture == nil,
              processing == nil, photoLookupID == nil, photos.count < 3, state != .matches, candidateID == nil || state == .networkError else { return }
        capture = Task { @MainActor in
            defer { capture = nil; render() }
            let captureStartedAt = Self.ocrDiagnosticsEnabled ? ProcessInfo.processInfo.systemUptime : nil
            do {
                let photo = try await scanner.capturePhoto()
                guard !Task.isCancelled, !closed else { return }
                let factor = min(1, 1600 / max(photo.size.width, photo.size.height))
                let bounds = CGRect(x: 0, y: 0, width: floor(photo.size.width * factor), height: floor(photo.size.height * factor))
                let format = UIGraphicsImageRendererFormat()
                format.scale = 1
                let preview = UIGraphicsImageRenderer(size: bounds.size, format: format).image { _ in photo.draw(in: bounds) }
                guard let data = preview.jpegData(compressionQuality: 0.72).flatMap({
                    $0.count <= 1048576 ? $0 : preview.jpegData(compressionQuality: 0.5)
                }), data.count <= 1048576 else {
                    showHint("Photo unavailable", "Try another photo")
                    return
                }
                candidateID = nil
                hasCapturedPhoto = true // Intentionally never cleared by deleting a photo.
                photos.append((preview, "data:image/jpeg;base64," + data.base64EncodedString()))
                selectedPhoto = photos.count - 1
                rebuildThumbnails()
                identifyPhotos(captureStartedAt: captureStartedAt,
                               captureDurationMs: captureStartedAt.map { (ProcessInfo.processInfo.systemUptime - $0) * 1000 })
            } catch {
                guard !Task.isCancelled, !closed else { return }
                showHint("Photo unavailable", "Try another photo")
            }
        }
        render()
    }
    private func rebuildThumbnails() {
        strip.arrangedSubviews.forEach { strip.removeArrangedSubview($0); $0.removeFromSuperview() }
        for (index, photo) in photos.enumerated() {
            let button = UIButton(type: .custom)
            button.setImage(photo.image, for: .normal)
            button.imageView?.contentMode = .scaleAspectFill
            button.clipsToBounds = true
            button.layer.cornerRadius = 13
            button.layer.borderWidth = index == selectedPhoto ? 3 : 2
            button.layer.borderColor = index == selectedPhoto ? lime.cgColor : UIColor(red: 232/255, green: 251/255, blue: 203/255, alpha: 1).cgColor
            button.widthAnchor.constraint(equalToConstant: 66).isActive = true
            button.tag = index
            button.accessibilityLabel = "Select photo \(index + 1)"
            button.accessibilityTraits = index == selectedPhoto ? [.button, .selected] : .button
            button.addTarget(self, action: #selector(selectPhoto(_:)), for: .touchUpInside)
            strip.addArrangedSubview(button)
        }
    }
    @objc private func selectPhoto(_ sender: UIButton) {
        guard photos.indices.contains(sender.tag) else { return }
        selectedPhoto = sender.tag
        rebuildThumbnails()
    }
    @objc private func deletePhoto() {
        guard !closed, !manualOpening, capture == nil, photos.indices.contains(selectedPhoto) else { return }
        invalidatePhotoLookup()
        photos.remove(at: selectedPhoto)
        selectedPhoto = max(0, min(selectedPhoto, photos.count - 1))
        rebuildThumbnails()
        if photos.isEmpty { state = .photo; render() }
        else { identifyPhotos(trigger: "photo_deleted") }
    }
    // Raw OCR is opt-in for a live Xcode run of the Debug test bundle.
    private static var ocrDiagnosticsEnabled: Bool {
        #if DEBUG
        return Bundle.main.bundleIdentifier == "com.fancyacuppa.test"
            && ProcessInfo.processInfo.environment["FAC_OCR_P1_CONSOLE"] == "1"
        #else
        return false
        #endif
    }
    private static func emitOCRDiagnostic(_ payload: [String: Any]) {
        #if DEBUG
        guard ocrDiagnosticsEnabled else { return }
        DispatchQueue.global(qos: .utility).async {
            guard JSONSerialization.isValidJSONObject(payload),
                  let data = try? JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys]),
                  let line = String(data: data, encoding: .utf8) else { return }
            print("[FAC-OCR-P1] " + line)
        }
        #endif
    }
    func reportOCRDiagnostic(id: String?, payload: [String: Any]?) {
        guard Self.ocrDiagnosticsEnabled, cameraActive, !closed, let id,
              id == diagnosticPhotoID, id == acceptedPhotoID, let payload else { return }
        diagnosticPhotoID = nil
        Self.emitOCRDiagnostic(payload)
    }
    // Apple Vision stays on-device. Work off an immutable snapshot and reject
    // results for deleted photos, old snapshots or a dismissed camera.
    private static func recognizeText(in images: [UIImage]) -> (lines: [[String]], reports: [[String: Any]], durationMs: Double) {
        let start = ProcessInfo.processInfo.systemUptime
        let diagnostic = ocrDiagnosticsEnabled
        var output: [[String]] = []
        var photoReports: [[String: Any]] = []
        for (index, image) in images.enumerated() {
            let photoStart = ProcessInfo.processInfo.systemUptime
            var lines: [String] = []
            var observations: [[String: Any]] = []
            var recognitionError: String?
            if let cgImage = image.cgImage {
                let request = VNRecognizeTextRequest()
                request.recognitionLevel = .accurate
                request.usesLanguageCorrection = true
                do {
                    try VNImageRequestHandler(cgImage: cgImage).perform([request])
                    for observation in request.results ?? [] {
                        guard let candidate = observation.topCandidates(1).first else { continue }
                        let accepted = candidate.confidence >= 0.35
                        if accepted { lines.append(candidate.string) }
                        if diagnostic {
                            observations.append([
                                "text": candidate.string,
                                "confidence": Double(candidate.confidence),
                                "accepted": accepted,
                                "reason": accepted ? "accepted" : "below_0.35_confidence"
                            ])
                        }
                    }
                } catch {
                    recognitionError = String(describing: error)
                }
            } else {
                recognitionError = "no_cgimage"
            }
            output.append(lines)
            if diagnostic {
                var report: [String: Any] = [
                    "photoIndex": index + 1,
                    "acceptedLines": lines,
                    "observations": observations,
                    "acceptedCount": lines.count,
                    "ocrDurationMs": (ProcessInfo.processInfo.systemUptime - photoStart) * 1000
                ]
                if let recognitionError { report["error"] = recognitionError }
                photoReports.append(report)
            }
        }
        return (output, photoReports, (ProcessInfo.processInfo.systemUptime - start) * 1000)
    }
    private func identifyPhotos(trigger: String = "capture", captureStartedAt: Double? = nil,
                                captureDurationMs: Double? = nil) {
        invalidatePhotoLookup()
        guard !photos.isEmpty else { state = .photo; render(); return }
        let revision = photoRevision
        let epoch = diagnosticEpoch
        let images = photos.map { $0.image }
        state = .identifying
        processing = Task { @MainActor in
            let recognized = await withCheckedContinuation { continuation in
                DispatchQueue.global(qos: .userInitiated).async {
                    continuation.resume(returning: Self.recognizeText(in: images))
                }
            }
            guard !Task.isCancelled, !closed, revision == photoRevision else { return }
            processing = nil
            let id = UUID().uuidString
            let unreadable = recognized.lines.last?.isEmpty != false
            let reportEnabled = Self.ocrDiagnosticsEnabled && cameraActive && epoch == diagnosticEpoch
            if reportEnabled {
                let report: [String: Any] = [
                    "version": 1,
                    "id": id,
                    "revision": revision,
                    "trigger": trigger,
                    "photoCount": images.count,
                    "photos": recognized.reports,
                    "ocrDurationMs": recognized.durationMs,
                    "captureDurationMs": captureDurationMs.map { $0 as Any } ?? NSNull(),
                    "captureToOCRMs": captureStartedAt.map { ((ProcessInfo.processInfo.systemUptime - $0) * 1000) as Any } ?? NSNull(),
                    "ocrGate": unreadable ? "latest_photo_unreadable" : "passed",
                    "stage": unreadable ? "ocr_only" : "ocr_complete"
                ]
                Self.emitOCRDiagnostic(report)
            }
            if unreadable {
                state = .unreadablePhoto
            } else {
                let lines = recognized.lines.flatMap { $0 }
                photoLookupID = id
                diagnosticPhotoID = reportEnabled ? id : nil
                onPhotoText(id, lines, reportEnabled ? ["version": 1] : nil)
                photoLookupTimeout = Task { @MainActor [weak self] in
                    try? await Task.sleep(nanoseconds: 8_000_000_000)
                    guard !Task.isCancelled else { return }
                    if let self, self.diagnosticPhotoID == id {
                        self.diagnosticPhotoID = nil
                        Self.emitOCRDiagnostic(["stage": "match_timeout", "id": id, "revision": revision])
                    }
                    self?.showPhotoResult(id: id, result: "lookup_error", candidates: [])
                }
            }
            render()
        }
        render()
    }
    func showPhotoResult(id: String?, result value: String?, candidates values: [[String: String]]) {
        guard !closed, let id, id == photoLookupID else { return }
        photoLookupID = nil
        photoLookupTimeout?.cancel()
        photoLookupTimeout = nil
        acceptedPhotoID = id
        candidates = values.filter { !($0["id"] ?? "").isEmpty }
        if value == "possible", !candidates.isEmpty { state = .matches }
        else { state = value == "lookup_error" ? .networkError : .noMatch }
        rebuildCandidates()
        render()
    }
    private func rebuildCandidates() {
        candidateRows.arrangedSubviews.forEach { candidateRows.removeArrangedSubview($0); $0.removeFromSuperview() }
        for (index, tea) in candidates.enumerated() {
            let row = UIButton(type: .custom)
            row.backgroundColor = .white
            row.tag = index
            row.accessibilityLabel = [tea["name"], tea["brand"]].compactMap { $0 }.joined(separator: ", ")
            row.heightAnchor.constraint(equalToConstant: 82).isActive = true
            let marker = UILabel()
            marker.backgroundColor = charcoal
            marker.textColor = lime
            marker.textAlignment = .center
            marker.layer.cornerRadius = 24
            marker.clipsToBounds = true
            if let url = Bundle.main.url(forResource: "tea-symbols-sharp", withExtension: "ttf", subdirectory: "public/fonts") {
                CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
            }
            marker.font = UIFont(name: "MaterialSymbolsSharp-Regular", size: 24)
            marker.text = tea["symbol"] ?? "category"
            marker.frame = CGRect(x: 16, y: 17, width: 48, height: 48)
            row.addSubview(marker)
            let arrow = UIImageView(image: icon("uc02-open"))
            arrow.frame = CGRect(x: view.bounds.width - 72, y: 17, width: 48, height: 48)
            row.addSubview(arrow)
            for (offset, key) in ["name", "brand"].enumerated() {
                let label = UILabel(frame: CGRect(x: 76, y: CGFloat(18 + offset * 23), width: max(0, view.bounds.width - 156), height: 23))
                label.font = mono(16, weight: offset == 0 ? .semibold : .regular)
                label.text = tea[key]
                label.textColor = charcoal
                label.isUserInteractionEnabled = false
                row.addSubview(label)
            }
            row.addTarget(self, action: #selector(selectCandidate(_:)), for: .touchUpInside)
            candidateRows.addArrangedSubview(row)
        }
    }
    @objc private func selectCandidate(_ sender: UIButton) {
        guard !manualOpening, state == .matches, candidates.indices.contains(sender.tag), acceptedPhotoID != nil else { return }
        selectedTeaID = candidates[sender.tag]["id"]
        finish("use_photo")
    }
    private func showHint(_ title: String, _ detail: String) {
        titleLabel.text = title
        detailLabel.text = detail
        detailLabel.isHidden = detail.isEmpty
        toastIcon.image = icon("uc02-info")
        toast.isHidden = false
        view.setNeedsLayout()
    }
    private func updateSearchAnimation(_ searching: Bool) {
        let key = "uc02-search-rotation"
        guard searching, cameraActive, !cameraUnavailable, !closed else {
            toastIcon.layer.removeAnimation(forKey: key)
            return
        }
        if toastIcon.layer.animation(forKey: key) == nil {
            let rotation = CABasicAnimation(keyPath: "transform.rotation.z")
            rotation.fromValue = 0
            rotation.toValue = Double.pi * 2
            rotation.duration = 1
            rotation.repeatCount = .infinity
            toastIcon.layer.add(rotation, forKey: key)
        }
    }
    deinit {
        manualCollapseTask?.cancel()
    }
    private func setManualShortcutExpanded(_ expanded: Bool) {
        view.layoutIfNeeded()
        manualExpanded = expanded
        view.setNeedsLayout()
        UIView.animate(withDuration: 0.18, delay: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.view.layoutIfNeeded()
        }
    }
    private func cancelManualCollapse() {
        manualCollapseTask?.cancel()
        manualCollapseTask = nil
    }
    @objc private func cancelManualShortcut() {
        cancelManualCollapse()
        manualExpanded = false
        manualOpening = false
        view.setNeedsLayout()
    }
    @objc private func openManualShortcut() {
        guard manual.isEnabled, cameraActive, !closed, !manualOpening else { return }
        cancelManualCollapse()
        if !manualExpanded {
            setManualShortcutExpanded(true)
            manualCollapseTask = Task { @MainActor [weak self] in
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard !Task.isCancelled, let self else { return }
                self.manualCollapseTask = nil
                self.setManualShortcutExpanded(false)
            }
            return
        }
        manualOpening = true
        candidateID = nil
        onState("mode_changed")
        addTea()
    }
    private func render() {
        guard isViewLoaded else { return }
        var title = "Looking for a barcode…"
        var detail = ""
        var instruction = "Show your tea pack"
        var buttonTitle = "No barcode · Continue"
        switch state {
        case .barcode: if candidateID != nil { title = "Checking the catalogue…" }
        case .knownBarcode:
            title = "Found your tea!"; instruction = ""
        case .unknownBarcode:
            title = "Barcode captured"; detail = "No tea linked yet"
            instruction = "Take a photo of the front"; buttonTitle = "SCAN BARCODE AGAIN"
        case .unreadableBarcode:
            title = "Couldn't read the barcode"; instruction = "Try again or take a photo"
        case .photo:
            title = ""; instruction = hasCapturedPhoto ? "Try another photo" : "Take a photo of the front"
            buttonTitle = "SCAN BARCODE AGAIN"
        case .identifying:
            title = "Looking for your tea…"; instruction = ""; buttonTitle = "SCAN BARCODE AGAIN"
        case .unreadablePhoto:
            title = "Couldn't read the details"; instruction = "Try another photo"; buttonTitle = "SCAN BARCODE AGAIN"
        case .matches:
            title = "We found possible matches"; instruction = ""
            buttonTitle = candidates.count == 1 ? "NOT MY TEA" : "NONE OF THESE"
        case .noMatch:
            title = "No match found"
            instruction = photos.count >= 2 ? "Let's add your tea" : "Scan brewing details"
            buttonTitle = "ADD NEW TEA"
        case .networkError:
            title = "Can’t check the catalogue"; instruction = "Check your connection"; buttonTitle = "SCAN BARCODE AGAIN"
        }
        if cameraUnavailable {
            title = "Camera access is off"; instruction = "Allow camera access to continue"
        }
        showHint(title, detail)
        toast.isHidden = title.isEmpty
        toastIcon.image = icon(state == .networkError ? "uc02-offline" : state == .unknownBarcode || state == .matches ? "uc02-check" : "uc02-info")
        if state == .identifying || state == .barcode {
            toastIcon.image = icon(cameraUnavailable ? "uc02-progress" : "uc02-progress-white")
        } else if state == .unreadableBarcode || state == .unreadablePhoto {
            toastIcon.image = icon("uc02-error")
        } else if state == .knownBarcode {
            toastIcon.image = icon("uc02-success")
        } else if state == .noMatch {
            toastIcon.image = icon("uc02-info-white")
        }
        updateSearchAnimation(state == .barcode || state == .identifying)
        hintIcon.image = icon(cameraUnavailable || state == .networkError ? "uc02-cancel" : "uc02-info-green")
        hintLabel.text = instruction
        hint.isHidden = instruction.isEmpty || barcodeOnly
        action.setTitle(buttonTitle, for: .normal)
        let busy = capture != nil || processing != nil || photoLookupID != nil || manualOpening || state == .knownBarcode
        action.isEnabled = !closed && !busy && state != .networkError && !cameraUnavailable
            && !(hasCapturedPhoto && (state == .photo || state == .unreadablePhoto))
        action.alpha = action.isEnabled ? 1 : 0.3
        action.isHidden = barcodeOnly || cameraUnavailable || state == .knownBarcode
        shutter.isHidden = barcodeOnly || state == .matches || cameraUnavailable
        shutter.isEnabled = !closed && !busy && photos.count < 3 && scanner?.isScanning == true
            && (candidateID == nil || state == .networkError)
        shutter.alpha = shutter.isEnabled ? 1 : 0.3
        manual.isHidden = barcodeOnly || cameraUnavailable
        manual.isEnabled = !closed && !busy
        trash.isHidden = photos.isEmpty || manualExpanded
        trash.isEnabled = capture == nil && !closed
        candidateScroll.isHidden = state != .matches
        thumbnails.isHidden = photos.isEmpty
        finder.isHidden = cameraUnavailable
        view.setNeedsLayout()
    }
    @objc private func addTea() {
        guard !closed, capture == nil, processing == nil, photoLookupID == nil else { return }
        if state == .matches { acceptedPhotoID = nil }
        finish("add")
    }
    @objc private func closeCamera() { finish("close") }
    func closeForQuickAccess() { closeCamera() }
    private func finish(_ action: String) {
        guard !closed else { return }
        closed = true
        stopScanner()
        processing?.cancel()
        photoLookupTimeout?.cancel()
        scanner?.delegate = nil
        NotificationCenter.default.removeObserver(self)
        let photoPreviews = self.photos.map { $0.preview }
        let photos = action == "add" ? photoPreviews : []
        let barcodeID = acceptedBarcodeID
        let photoID = acceptedPhotoID
        let teaID = selectedTeaID
        self.photos.removeAll()
        onState("closed")
        dismiss(animated: true) { [onClose] in onClose(action, photos, barcodeID, photoID, teaID) }
    }
}
