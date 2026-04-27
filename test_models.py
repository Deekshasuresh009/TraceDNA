import google.genai as genai
import os
c = genai.Client(api_key=os.environ.get('GEMINI_API_KEY'))
for m in c.models.list():
    if 'gemini' in m.name:
        print(m.name)
