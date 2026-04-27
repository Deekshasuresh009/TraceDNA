import os
from google.cloud import storage

if __name__ == "__main__":
    try:
        client = storage.Client()
        bucket = client.bucket("tracedna-vault1")
        print("--- TRACEDNA GCS VAULT SIZES ---")
        for b in bucket.list_blobs():
            print(f"{b.name}: {b.size} bytes")
    except Exception as e:
        print("Error checking GCS:", e)
