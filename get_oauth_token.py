from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
import json

SCOPES = [
    'https://www.googleapis.com/auth/gmail.modify',
    'https://www.googleapis.com/auth/gmail.settings.basic',
    'https://www.googleapis.com/auth/gmail.settings.sharing',
    'https://www.googleapis.com/auth/userinfo.email',
    'https://www.googleapis.com/auth/userinfo.profile',
    'openid'
]

CLIENT_CONFIG = {
    'installed': {
        'client_id': '1003183447181-0vbn1fmq1666ko8ca256dggs0tvm1q13.apps.googleusercontent.com',
        'client_secret': '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',
        'auth_uri': 'https://accounts.google.com/o/oauth2/auth',
        'token_uri': 'https://oauth2.googleapis.com/token',
        'redirect_uris': ['http://localhost']
    }
}

def main():
    flow = InstalledAppFlow.from_client_config(CLIENT_CONFIG, SCOPES)
    credentials = flow.run_local_server(port=8888, prompt='consent', access_type='offline')
    
    print("\n=== REFRESH TOKEN ===")
    print(credentials.refresh_token)
    print("====================\n")
    
    # Save to file
    creds_dict = {
        'refresh_token': credentials.refresh_token,
        'client_id': credentials.client_id,
        'client_secret': credentials.client_secret,
    }
    with open('credentials.json', 'w') as f:
        json.dump(creds_dict, f, indent=2)
    print("Saved to credentials.json")

if __name__ == '__main__':
    main()
