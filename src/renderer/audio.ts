export interface AudioData {
  bass: number;
  mid: number;
  high: number;
  volume: number;
  beat: number;
  beatTime: number;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private freqData: Uint8Array = new Uint8Array(0);
  private timeData: Uint8Array = new Uint8Array(0);

  // Smoothed values
  private sBass = 0;
  private sMid = 0;
  private sHigh = 0;

  // Beat detection
  private bassHistory: number[] = [];
  private lastBeatTime = 0;
  private beatActive = false;
  private beatTimestamp = 0; // time of last beat in seconds (performance.now based)
  private manualBeat = false;

  readonly data: AudioData = {
    bass: 0,
    mid: 0,
    high: 0,
    volume: 0,
    beat: 0,
    beatTime: 999,
  };

  async init(deviceId?: string) {
    if (this.ctx) {
      this.ctx.close();
    }

    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0.6;

    const binCount = this.analyser.frequencyBinCount;
    this.freqData = new Uint8Array(binCount);
    this.timeData = new Uint8Array(binCount);

    const constraints: MediaStreamConstraints = {
      audio: deviceId
        ? { deviceId: { exact: deviceId } }
        : true,
    };

    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.source = this.ctx.createMediaStreamSource(stream);
    this.source.connect(this.analyser);
  }

  triggerManualBeat() {
    this.manualBeat = true;
  }

  update(now: number) {
    if (!this.analyser) return;

    this.analyser.getByteFrequencyData(this.freqData);
    this.analyser.getByteTimeDomainData(this.timeData);

    // Raw band averages (0-1)
    const rawBass = this.avgBins(0, 10);
    const rawMid = this.avgBins(10, 100);
    const rawHigh = this.avgBins(100, 500);

    // Smoothing (low-pass)
    const sm = 0.15;
    this.sBass += (rawBass - this.sBass) * sm;
    this.sMid += (rawMid - this.sMid) * sm;
    this.sHigh += (rawHigh - this.sHigh) * sm;

    // RMS volume
    let rms = 0;
    for (let i = 0; i < this.timeData.length; i++) {
      const v = (this.timeData[i] - 128) / 128;
      rms += v * v;
    }
    rms = Math.sqrt(rms / this.timeData.length);

    // Beat detection: rolling window of bass values
    this.bassHistory.push(rawBass);
    if (this.bassHistory.length > 43) this.bassHistory.shift();

    let beatDetected = false;
    if (this.bassHistory.length >= 10) {
      const mean =
        this.bassHistory.reduce((a, b) => a + b, 0) / this.bassHistory.length;
      const stddev = Math.sqrt(
        this.bassHistory.reduce((a, b) => a + (b - mean) ** 2, 0) /
          this.bassHistory.length
      );
      const threshold = mean + 1.5 * stddev;
      const elapsed = now - this.lastBeatTime;

      if (rawBass > threshold && elapsed > 0.2) {
        beatDetected = true;
        this.lastBeatTime = now;
        this.beatTimestamp = now;
      }
    }

    // Manual beat override
    if (this.manualBeat) {
      beatDetected = true;
      this.beatTimestamp = now;
      this.lastBeatTime = now;
      this.manualBeat = false;
    }

    this.data.bass = this.sBass;
    this.data.mid = this.sMid;
    this.data.high = this.sHigh;
    this.data.volume = Math.min(rms * 2, 1);
    this.data.beat = beatDetected ? 1 : 0;
    this.data.beatTime = now - this.beatTimestamp;
  }

  private avgBins(from: number, to: number): number {
    if (!this.freqData.length) return 0;
    const end = Math.min(to, this.freqData.length);
    let sum = 0;
    for (let i = from; i < end; i++) {
      sum += this.freqData[i];
    }
    return sum / ((end - from) * 255);
  }

  async getDevices(): Promise<MediaDeviceInfo[]> {
    const devices = await navigator.mediaDevices.enumerateDevices();
    return devices.filter((d) => d.kind === "audioinput");
  }
}
