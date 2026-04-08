// Handles getUserMedia + AudioContext setup. One shared context per session.

export interface MicStream {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  stream: MediaStream;
  stop: () => void;
}

export async function openMic(deviceId?: string): Promise<MicStream> {
  const constraints: MediaStreamConstraints = {
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: 1,
    },
    video: false,
  };
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  // Safari prefixes removed years ago; Chrome works with the standard ctor.
  const context = new AudioContext({ sampleRate: 44100 });
  const source = context.createMediaStreamSource(stream);
  return {
    context,
    source,
    stream,
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      context.close().catch(() => {});
    },
  };
}

export async function listInputDevices(): Promise<MediaDeviceInfo[]> {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.filter((d) => d.kind === 'audioinput');
}
