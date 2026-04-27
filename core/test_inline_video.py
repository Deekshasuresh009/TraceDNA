import os
import urllib.request
import google.genai as genai
import google.genai.types as genai_types

api_key = os.environ.get("GEMINI_API_KEY", "")
ai_client = genai.Client(api_key=api_key)

# Download a tiny real video
url = "https://www.w3schools.com/html/mov_bbb.mp4"
print("Downloading test video...")
with urllib.request.urlopen(url) as resp:
    video_bytes = resp.read()
print(f"Downloaded {len(video_bytes)/1024:.1f}KB")

# Test inline video call
print("Calling Gemini 2.5-flash with inline video...")
response = ai_client.models.generate_content(
    model="gemini-2.5-flash",
    contents=[
        genai_types.Content(parts=[
            genai_types.Part(text="Briefly describe what is happening in this video in one sentence."),
            genai_types.Part(inline_data=genai_types.Blob(mime_type="video/mp4", data=video_bytes)),
        ])
    ],
    config=genai_types.GenerateContentConfig(temperature=0.0)
)
print("SUCCESS! Gemini says:", response.text[:300])
