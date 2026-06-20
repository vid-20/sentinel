import requests
import json

url = 'http://127.0.0.1:8000/api/train-model'
print(f"Sending POST request to {url} to retrain the model...")

try:
    res = requests.post(url)
    print('Status Code:', res.status_code)
    try:
        response_json = res.json()
        print('Response:\n', json.dumps(response_json, indent=4))
    except Exception:
        print('Response text:\n', res.text)
except Exception as e:
    print('Failed to connect to backend:', e)
