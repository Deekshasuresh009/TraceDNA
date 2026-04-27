#!/usr/bin/env python3
"""
TraceDNA Instagram Cookie Uploader
Run this script on the VM to upload Instagram cookies.
Usage: python3 upload_ig_cookies.py <path_to_cookies.txt>
"""
import sys
import os
import subprocess

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 upload_ig_cookies.py <path_to_cookies.txt>")
        sys.exit(1)
    
    cookies_path = sys.argv[1]
    if not os.path.exists(cookies_path):
        print(f"File not found: {cookies_path}")
        sys.exit(1)
    
    # Copy into both celery containers
    print("Uploading cookies to TraceDNA containers...")
    os.makedirs("/home/DELL/secrets", exist_ok=True)
    subprocess.run(["cp", cookies_path, "/home/DELL/secrets/instagram_cookies.txt"], check=True)
    subprocess.run(["docker", "exec", "tracedna-celery", "mkdir", "-p", "/app/secrets"], check=True)
    subprocess.run(["docker", "exec", "tracedna-celery", "bash", "-c", 
                    f"cat /home/DELL/secrets/instagram_cookies.txt > /app/secrets/instagram_cookies.txt"], check=True)
    subprocess.run(["docker", "cp", "/home/DELL/secrets/instagram_cookies.txt", 
                    "tracedna-celery:/app/secrets/instagram_cookies.txt"], check=True)
    subprocess.run(["docker", "cp", "/home/DELL/secrets/instagram_cookies.txt", 
                    "tracedna-beat:/app/secrets/instagram_cookies.txt"], check=True)
    print("✅ Cookies uploaded successfully!")
    print("Instagram downloads will now work without login for your users.")

if __name__ == "__main__":
    main()
