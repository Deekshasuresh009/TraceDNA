import google.genai as g
import os

api_key = os.environ.get("GEMINI_API_KEY", "")
c = g.Client(api_key=api_key)
models = list(c.models.list())
for m in sorted(models, key=lambda x: x.name):
    if "flash" in m.name.lower() or ("pro" in m.name.lower() and "gemini" in m.name.lower()):
        print(m.name)
