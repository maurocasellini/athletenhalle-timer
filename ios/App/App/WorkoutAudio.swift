import Foundation
import UIKit
import AVFoundation
import Capacitor

// MARK: - Bridge

/// Root view controller: the stock Capacitor bridge plus the app's own native plugin.
class MainViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(WorkoutAudioPlugin())
    }
}

/// JS API (window.Capacitor.Plugins.WorkoutAudio):
///   schedule({ cues: [{ at, sound?, text?, lang?, haptic? }], soundOn, voiceOn, hapticsOn, volume })
///   stop()                       – clear everything, release the audio session
///   play({ sound?, text?, lang?, haptic?, soundOn, voiceOn, hapticsOn, volume }) – play right now
///   keepAwake({ on })            – keep the screen from locking
///
/// `at` is a wall-clock time in ms since 1970 (same clock as JS Date.now()). The web layer
/// computes the whole remaining workout up front, so cues keep firing on time while the
/// screen is locked or the web view is suspended.
@objc(WorkoutAudioPlugin)
public class WorkoutAudioPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutAudioPlugin"
    public let jsName = "WorkoutAudio"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "schedule", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "play", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
    ]

    private func applyOptions(_ call: CAPPluginCall) {
        let e = CueEngine.shared
        e.soundOn = call.getBool("soundOn") ?? e.soundOn
        e.voiceOn = call.getBool("voiceOn") ?? e.voiceOn
        e.hapticsOn = call.getBool("hapticsOn") ?? e.hapticsOn
        if let v = call.getFloat("volume") { e.volume = max(0, min(1, v)) }
    }

    private static func number(_ v: JSValue?) -> Double? {
        if let n = v as? NSNumber { return n.doubleValue }
        if let d = v as? Double { return d }
        if let i = v as? Int { return Double(i) }
        return nil
    }

    @objc func schedule(_ call: CAPPluginCall) {
        applyOptions(call)
        let raw = call.getArray("cues", JSObject.self) ?? []
        let cues: [Cue] = raw.compactMap { o in
            guard let at = Self.number(o["at"]) else { return nil }
            return Cue(at: at,
                       sound: o["sound"] as? String,
                       text: o["text"] as? String,
                       lang: o["lang"] as? String,
                       haptic: (o["haptic"] as? Bool) ?? false)
        }
        CueEngine.shared.setSchedule(cues)
        call.resolve()
    }

    @objc func stop(_ call: CAPPluginCall) {
        CueEngine.shared.stopAll()
        call.resolve()
    }

    @objc func play(_ call: CAPPluginCall) {
        applyOptions(call)
        let cue = Cue(at: Date().timeIntervalSince1970 * 1000,
                      sound: call.getString("sound"),
                      text: call.getString("text"),
                      lang: call.getString("lang"),
                      haptic: call.getBool("haptic") ?? false)
        CueEngine.shared.playNow(cue)
        call.resolve()
    }

    @objc func keepAwake(_ call: CAPPluginCall) {
        let on = call.getBool("on") ?? true
        DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
        call.resolve()
    }
}

// MARK: - Cue engine

struct Cue {
    let at: Double
    let sound: String?
    let text: String?
    let lang: String?
    let haptic: Bool
}

/// Plays timer beeps + voice cues from a time-ordered schedule.
///
/// Audio session: `.playback` + `.mixWithOthers` → plays through the silent switch, mixes
/// with Spotify & co. (they keep playing), and — together with the `audio` background mode —
/// keeps the app running while the screen is locked. A silent buffer loops while a workout is
/// scheduled so iOS sees continuous playback; it stops as soon as nothing is scheduled.
final class CueEngine: NSObject {
    static let shared = CueEngine()

    var volume: Float = 0.9 { didSet { engine.mainMixerNode.outputVolume = volume } }
    var soundOn = true
    var voiceOn = true
    var hapticsOn = true

    private let queue = DispatchQueue(label: "grit.cue-engine")
    private var timer: DispatchSourceTimer?
    private var cues: [Cue] = []
    private var active = false
    private var idleStop: DispatchWorkItem?

    private let engine = AVAudioEngine()
    private let beepNode = AVAudioPlayerNode()
    private let keepAliveNode = AVAudioPlayerNode()
    private let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
    private var sounds: [String: AVAudioPCMBuffer] = [:]
    private var silence: AVAudioPCMBuffer!
    private let synth = AVSpeechSynthesizer()

    private override init() {
        super.init()
        engine.attach(beepNode)
        engine.attach(keepAliveNode)
        engine.connect(beepNode, to: engine.mainMixerNode, format: format)
        engine.connect(keepAliveNode, to: engine.mainMixerNode, format: format)
        engine.mainMixerNode.outputVolume = volume
        sounds = SoundBank.make(format: format)
        silence = SoundBank.silence(format: format, seconds: 0.5)

        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(onInterruption(_:)), name: AVAudioSession.interruptionNotification, object: nil)
        nc.addObserver(self, selector: #selector(onRestartNeeded), name: AVAudioSession.mediaServicesWereResetNotification, object: nil)
        nc.addObserver(self, selector: #selector(onRestartNeeded), name: .AVAudioEngineConfigurationChange, object: engine)
    }

    // MARK: public (any thread)

    func setSchedule(_ list: [Cue]) {
        queue.async {
            let now = Self.nowMs()
            self.cues = list.filter { $0.at > now - 250 }.sorted { $0.at < $1.at }
            if self.cues.isEmpty {
                self.scheduleIdleStop()
            } else {
                self.cancelIdleStop()
                self.activate()
                self.tick()
            }
        }
    }

    func playNow(_ cue: Cue) {
        queue.async {
            self.activate()
            self.fire(cue)
            if self.cues.isEmpty { self.scheduleIdleStop() }
        }
    }

    func stopAll() {
        queue.async { self.deactivate() }
    }

    // MARK: session / engine (on queue)

    private func activate() {
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .default, options: [.mixWithOthers])
            try session.setActive(true)
        } catch {
            NSLog("[GRIT] audio session error: \(error)")
        }
        startEngineIfNeeded()
        startTimer()
        active = true
    }

    private func startEngineIfNeeded() {
        if !engine.isRunning {
            do { try engine.start() } catch { NSLog("[GRIT] engine start error: \(error)"); return }
        }
        if !keepAliveNode.isPlaying {
            keepAliveNode.scheduleBuffer(silence, at: nil, options: .loops, completionHandler: nil)
            keepAliveNode.play()
        }
        if !beepNode.isPlaying { beepNode.play() }
    }

    private func deactivate() {
        cancelIdleStop()
        cues.removeAll()
        timer?.cancel()
        timer = nil
        DispatchQueue.main.async { self.synth.stopSpeaking(at: .immediate) }
        keepAliveNode.stop()
        beepNode.stop()
        engine.stop()
        if active {
            try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
        }
        active = false
    }

    /// Nothing left to play: give the last sound/voice time to finish, then let iOS suspend us.
    private func scheduleIdleStop() {
        cancelIdleStop()
        let work = DispatchWorkItem { [weak self] in
            guard let self = self, self.cues.isEmpty else { return }
            self.deactivate()
        }
        idleStop = work
        queue.asyncAfter(deadline: .now() + 6, execute: work)
    }

    private func cancelIdleStop() {
        idleStop?.cancel()
        idleStop = nil
    }

    // MARK: clock

    private static func nowMs() -> Double { Date().timeIntervalSince1970 * 1000 }

    private func startTimer() {
        guard timer == nil else { return }
        let t = DispatchSource.makeTimerSource(queue: queue)
        t.schedule(deadline: .now(), repeating: .milliseconds(20), leeway: .milliseconds(4))
        t.setEventHandler { [weak self] in self?.tick() }
        t.resume()
        timer = t
    }

    private func tick() {
        let now = Self.nowMs()
        var fired = false
        while let next = cues.first, next.at <= now {
            cues.removeFirst()
            // skip cues that are long overdue (e.g. after an interruption) instead of a burst
            if now - next.at < 1500 { fire(next) }
            fired = true
        }
        if fired && cues.isEmpty { scheduleIdleStop() }
    }

    // MARK: output

    private func fire(_ cue: Cue) {
        if soundOn, let name = cue.sound, let buffer = sounds[name] {
            startEngineIfNeeded()
            beepNode.scheduleBuffer(buffer, at: nil, options: .interrupts, completionHandler: nil)
        }
        if voiceOn, let text = cue.text, !text.isEmpty {
            speak(text, lang: cue.lang ?? "en-US", delay: (soundOn && cue.sound != nil) ? 0.3 : 0)
        }
        if hapticsOn && cue.haptic {
            DispatchQueue.main.async {
                let g = UIImpactFeedbackGenerator(style: .heavy)
                g.impactOccurred()
            }
        }
    }

    private func speak(_ text: String, lang: String, delay: TimeInterval) {
        let u = AVSpeechUtterance(string: text)
        u.voice = Self.bestVoice(for: lang)
        u.rate = min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * 1.05)
        u.volume = volume
        u.preUtteranceDelay = delay
        DispatchQueue.main.async {
            if self.synth.isSpeaking { self.synth.stopSpeaking(at: .immediate) }
            self.synth.speak(u)
        }
    }

    private static var voiceCache: [String: AVSpeechSynthesisVoice] = [:]
    private static func bestVoice(for code: String) -> AVSpeechSynthesisVoice? {
        if let v = voiceCache[code] { return v }
        let all = AVSpeechSynthesisVoice.speechVoices()
        let prefix = String(code.prefix(2))
        func best(_ list: [AVSpeechSynthesisVoice]) -> AVSpeechSynthesisVoice? {
            list.max { $0.quality.rawValue < $1.quality.rawValue }
        }
        let v = best(all.filter { $0.language == code })
            ?? best(all.filter { $0.language.hasPrefix(prefix) })
            ?? AVSpeechSynthesisVoice(language: code)
        if let v = v { voiceCache[code] = v }
        return v
    }

    // MARK: interruptions (calls, Siri, route changes)

    @objc private func onInterruption(_ note: Notification) {
        guard let raw = note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw),
              type == .ended else { return }
        queue.async { if self.active && !self.cues.isEmpty { self.activate() } }
    }

    @objc private func onRestartNeeded() {
        queue.async { if self.active && !self.cues.isEmpty { self.activate() } }
    }
}

// MARK: - Sounds (synthesised, no audio files needed)

enum SoundBank {
    enum Wave { case sine, square, triangle }
    /// (frequency Hz, start s, duration s, wave, gain)
    typealias Part = (Double, Double, Double, Wave, Float)

    static func make(format: AVAudioFormat) -> [String: AVAudioPCMBuffer] {
        let defs: [String: [Part]] = [
            "count": [(880, 0, 0.14, .square, 0.35)],
            "work": [(1320, 0, 0.55, .square, 0.4)],
            "rest": [(990, 0, 0.2, .triangle, 0.6), (660, 0.2, 0.38, .triangle, 0.6)],
            "halfway": [(1100, 0, 0.09, .sine, 0.5), (1100, 0.15, 0.09, .sine, 0.5)],
            "tap": [(1500, 0, 0.05, .sine, 0.35)],
            "done": [(1046, 0, 0.16, .square, 0.35), (1318, 0.16, 0.16, .square, 0.35),
                     (1568, 0.32, 0.16, .square, 0.35), (2093, 0.5, 0.7, .square, 0.35)],
        ]
        var out: [String: AVAudioPCMBuffer] = [:]
        for (name, parts) in defs { out[name] = render(parts, format: format) }
        return out
    }

    static func silence(format: AVAudioFormat, seconds: Double) -> AVAudioPCMBuffer {
        let frames = AVAudioFrameCount(format.sampleRate * seconds)
        let b = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        b.frameLength = frames
        if let ch = b.floatChannelData?[0] { for i in 0..<Int(frames) { ch[i] = 0 } }
        return b
    }

    private static func render(_ parts: [Part], format: AVAudioFormat) -> AVAudioPCMBuffer {
        let sr = format.sampleRate
        let total = parts.map { $0.1 + $0.2 }.max() ?? 0.1
        let frames = AVAudioFrameCount(sr * (total + 0.02))
        let b = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: frames)!
        b.frameLength = frames
        guard let ch = b.floatChannelData?[0] else { return b }
        for i in 0..<Int(frames) { ch[i] = 0 }
        for (freq, start, dur, wave, gain) in parts {
            let s0 = Int(start * sr)
            let n = Int(dur * sr)
            let attack = max(1, Int(0.01 * sr))
            let release = max(1, Int(0.03 * sr))
            for k in 0..<n where s0 + k < Int(frames) {
                let t = Double(k) / sr
                let phase = (t * freq).truncatingRemainder(dividingBy: 1)
                var v: Double
                switch wave {
                case .sine: v = sin(2 * .pi * phase)
                case .square: v = phase < 0.5 ? 1 : -1
                case .triangle: v = 1 - 4 * abs(phase - 0.5)
                }
                var env = 1.0
                if k < attack { env = Double(k) / Double(attack) }
                if k > n - release { env = min(env, Double(n - k) / Double(release)) }
                ch[s0 + k] += Float(v * env) * gain
            }
        }
        // keep headroom when parts overlap
        for i in 0..<Int(frames) { ch[i] = max(-1, min(1, ch[i])) }
        return b
    }
}
