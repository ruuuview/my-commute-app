import os
import wave
import math
import struct

def generate_wave(filename, duration, frequency_func, amplitude_func, sample_rate=44100):
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    num_samples = int(duration * sample_rate)
    
    with wave.open(filename, 'w') as wav:
        wav.setnchannels(1) # Mono
        wav.setsampwidth(2) # 16-bit
        wav.setframerate(sample_rate)
        
        phase = 0.0
        for i in range(num_samples):
            t = i / sample_rate
            freq = frequency_func(t, duration)
            amp = amplitude_func(t, duration)
            
            # Synthesize sine wave with low-pass noise component for physical organic texture
            phase += 2 * math.pi * freq / sample_rate
            sine_val = math.sin(phase)
            
            # Simple soft noise transient at the absolute start (t < 0.01s) for physical touch presence
            noise_val = 0.0
            if t < 0.01:
                noise_val = (math.sin(t * 100000) * 0.15) * (1.0 - t / 0.01)
                
            sample_val = sine_val * amp + noise_val * (amp * 0.5)
            # Clip value
            sample_val = max(-1.0, min(1.0, sample_val))
            
            # Convert to 16-bit PCM integer
            packed_sample = struct.pack('<h', int(sample_val * 32767))
            wav.writeframesraw(packed_sample)
            
    print(f"Generated physical audio asset: {filename}")

# Tap sound: high-fidelity, fast wood click
def tap_freq(t, duration):
    return 1100 - (t * 800) # fast pitch drop for tactile feel

def tap_amp(t, duration):
    # extremely fast exponential decay
    return math.exp(-t * 90) * 0.7

# Select sound: gorgeous physical bamboo slide/pop
def select_freq(t, duration):
    # frequency rise
    return 350 + (math.sin(t * math.pi * 5) * 150)

def select_amp(t, duration):
    # warm attack, snappy release
    if t < 0.015:
        return (t / 0.015) * 0.85
    return math.exp(-(t - 0.015) * 35) * 0.85

# Deselect sound: soft organic sliding wooden drop
def deselect_freq(t, duration):
    # frequency glide down
    return 550 - (t * 280)

def deselect_amp(t, duration):
    if t < 0.01:
        return (t / 0.01) * 0.75
    return math.exp(-(t - 0.01) * 45) * 0.75

if __name__ == "__main__":
    audio_dir = "assets/audio"
    generate_wave(os.path.join(audio_dir, "tap.wav"), 0.04, tap_freq, tap_amp)
    generate_wave(os.path.join(audio_dir, "select.wav"), 0.12, select_freq, select_amp)
    generate_wave(os.path.join(audio_dir, "deselect.wav"), 0.10, deselect_freq, deselect_amp)
