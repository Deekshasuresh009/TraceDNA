import google.genai as genai
import tempfile
import os

ai_client = genai.Client()

with tempfile.NamedTemporaryFile(suffix='.mp4', delete=False) as tmp:
    # Write exactly 1MB of dummy data
    tmp.write(b'0'*1024*1024)
    tmp_path = tmp.name

try:
    print('Testing upload...')
    ai_file = ai_client.files.upload(file=tmp_path)
    print('Upload Success!', ai_file.name)
except Exception as e:
    print('Upload Failed:', e)
finally:
    os.unlink(tmp_path)
