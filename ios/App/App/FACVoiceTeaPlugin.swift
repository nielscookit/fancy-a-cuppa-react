import AVFoundation
import Capacitor
import Speech
import UIKit

@objc(FACVoiceTeaPlugin)
final class FACVoiceTeaPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "FACVoiceTeaPlugin"
    let jsName = "FACVoiceTea"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "listen", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancel", returnType: CAPPluginReturnPromise)
    ]

    // All session state is accessed on the main queue.
    private struct Recognition {
        let recognizer: SFSpeechRecognizer
        let request: SFSpeechAudioBufferRecognitionRequest
        let task: SFSpeechRecognitionTask
    }

    private var pending: CAPPluginCall?
    private var recordings: [Recognition] = []
    private var unresolved: Set<String> = []
    private var transcripts: [String] = []
    private var engine: AVAudioEngine?
    private var originalAudio: (AVAudioSession.Category, AVAudioSession.Mode, AVAudioSession.CategoryOptions)?
    private var audioActive = false
    private var audioInstalled = false
    private var timeout: DispatchWorkItem?
    private var silence: DispatchWorkItem?
    private var lastPartial: [String: String] = [:]

    override func load() {
        NotificationCenter.default.addObserver(self, selector: #selector(interrupt),
            name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(audioInterrupted(_:)),
            name: AVAudioSession.interruptionNotification, object: AVAudioSession.sharedInstance())
    }

    @objc func status(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            call.resolve([
                "speech": SFSpeechRecognizer.authorizationStatus().rawValue,
                "microphone": Int(AVAudioSession.sharedInstance().recordPermission.rawValue),
                "locales": self.recognizers().map { $0.locale.identifier }
            ])
        }
    }

    @objc func listen(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard self.pending == nil else { call.reject("Recording already active.", "BUSY"); return }
            guard UIApplication.shared.applicationState == .active else { call.reject("App is inactive.", "CANCELLED"); return }
            self.pending = call
            SFSpeechRecognizer.requestAuthorization { [weak self] speech in
                DispatchQueue.main.async {
                    guard let self, self.pending === call else { return }
                    guard speech == .authorized else { self.finish("PERMISSION"); return }
                    AVAudioSession.sharedInstance().requestRecordPermission { [weak self] microphone in
                        DispatchQueue.main.async {
                            guard let self, self.pending === call else { return }
                            guard microphone else { self.finish("PERMISSION"); return }
                            self.start(call)
                        }
                    }
                }
            }
        }
    }

    @objc func cancel(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if self.pending?.getString("id") == call.getString("id") { self.finish("CANCELLED") }
            call.resolve()
        }
    }

    @objc private func interrupt() {
        DispatchQueue.main.async { self.finish("CANCELLED") }
    }

    @objc private func audioInterrupted(_ note: Notification) {
        if let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
           AVAudioSession.InterruptionType(rawValue: raw) == .began { interrupt() }
    }

    private func recognizers() -> [SFSpeechRecognizer] {
        ["de-DE", "en-GB"].compactMap { SFSpeechRecognizer(locale: Locale(identifier: $0)) }
            .filter { $0.isAvailable && $0.supportsOnDeviceRecognition }
    }

    private func start(_ call: CAPPluginCall) {
        guard UIApplication.shared.applicationState != .background else { finish("CANCELLED"); return }
        let recognizers = recognizers()
        guard !recognizers.isEmpty else { finish("UNAVAILABLE"); return }
        let session = AVAudioSession.sharedInstance()
        let audio = AVAudioEngine()
        originalAudio = (session.category, session.mode, session.categoryOptions)
        do {
            try session.setCategory(.playAndRecord, mode: .default, options: [.defaultToSpeaker, .mixWithOthers])
            try session.setActive(true)
            audioActive = true
            let input = audio.inputNode
            let format = input.outputFormat(forBus: 0)
            guard format.sampleRate > 0, format.channelCount > 0 else { finish("UNAVAILABLE"); return }
            engine = audio
            unresolved = Set(recognizers.map { $0.locale.identifier })
            recordings = recognizers.map { recognizer in
                let locale = recognizer.locale.identifier
                let request = SFSpeechAudioBufferRecognitionRequest()
                request.requiresOnDeviceRecognition = true
                request.shouldReportPartialResults = true
                let task = recognizer.recognitionTask(with: request) { [weak self] result, error in
                    DispatchQueue.main.async {
                        guard let self, self.pending === call, self.unresolved.contains(locale) else { return }
                        self.receive(result, failed: error != nil, locale: locale, call: call)
                    }
                }
                return Recognition(recognizer: recognizer, request: request, task: task)
            }
            let requests = recordings.map { $0.request }
            input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
                for request in requests { request.append(buffer) }
            }
            audioInstalled = true
            try audio.start()
            notifyListeners("phase", data: ["id": call.getString("id") ?? "", "phase": "listening"])
            let limit = DispatchWorkItem { [weak self] in self?.endCapture(call) }
            timeout = limit
            DispatchQueue.main.asyncAfter(deadline: .now() + 12, execute: limit)
        } catch {
            finish("UNAVAILABLE")
        }
    }

    private func receive(_ result: SFSpeechRecognitionResult?, failed: Bool, locale: String, call: CAPPluginCall) {
        let text = result?.bestTranscription.formattedString ?? ""
        if result?.isFinal == true || failed {
            if result?.isFinal == true && !text.isEmpty { transcripts.append(text) }
            unresolved.remove(locale)
            if unresolved.isEmpty { finish() }
        } else if !text.isEmpty && text != lastPartial[locale] && engine != nil {
            lastPartial[locale] = text
            silence?.cancel()
            let pause = DispatchWorkItem { [weak self] in self?.endCapture(call) }
            silence = pause
            DispatchQueue.main.asyncAfter(deadline: .now() + 1.7, execute: pause)
        }
    }

    private func endCapture(_ call: CAPPluginCall) {
        guard pending === call, engine != nil else { return }
        stopInput()
        notifyListeners("phase", data: ["id": call.getString("id") ?? "", "phase": "processing"])
        let limit = DispatchWorkItem { [weak self] in
            guard let self, self.pending === call else { return }
            if self.unresolved.isEmpty { self.finish() } else { self.finish("TIMEOUT") }
        }
        timeout = limit
        DispatchQueue.main.asyncAfter(deadline: .now() + 4, execute: limit)
    }

    private func stopInput() {
        timeout?.cancel()
        silence?.cancel()
        if audioInstalled { engine?.inputNode.removeTap(onBus: 0) }
        audioInstalled = false
        engine?.stop()
        engine = nil
        for item in recordings { item.request.endAudio() }
    }

    private func finish(_ error: String? = nil) {
        guard let call = pending else { return }
        pending = nil
        stopInput()
        for item in recordings { item.task.cancel() }
        recordings = []
        unresolved = []
        lastPartial = [:]
        let session = AVAudioSession.sharedInstance()
        if audioActive { try? session.setActive(false, options: .notifyOthersOnDeactivation) }
        if let (category, mode, options) = originalAudio {
            try? session.setCategory(category, mode: mode, options: options)
        }
        originalAudio = nil
        audioActive = false
        let final = transcripts
        transcripts = []
        if let error { call.reject("Voice input did not complete.", error) }
        else { call.resolve(["transcripts": final]) }
    }
}
