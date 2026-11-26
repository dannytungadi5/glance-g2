# Local Whisper STT (faster-whisper, tiny.en, CPU). Usage: python3 stt.py <wav>
import sys
from faster_whisper import WhisperModel
m = WhisperModel('tiny.en', device='cpu', compute_type='int8')
segs, _ = m.transcribe(sys.argv[1])
print(' '.join(s.text for s in segs).strip())
