# Brother Spotlight Form

A web app for collecting chapter internship, research, and job spotlights. It can run locally, through ngrok, or in GitHub Codespaces. Submissions save into the app's `submissions` folder wherever the app is running.

## Run It Locally

```bash
cd ~/Desktop/frat-scholarship-form
npm start
```

Open the local admin/test link:

```text
http://localhost:4173
```

## Public GroupMe Link With GitHub Codespaces

Codespaces is the better option if you want the form to stay online for a few days without keeping your Mac running. Submissions save inside the Codespace, then you export/download them afterward.

1. Push this folder to a GitHub repository.
2. Open the repository on GitHub.
3. Click `Code`, then `Codespaces`, then `Create codespace on main`.
4. In the Codespace terminal, run:

```bash
npm start
```

5. Open the `PORTS` tab.
6. Find port `4173`.
7. Make sure its visibility is `Public`.
8. Copy the forwarded address and send that link in GroupMe.

Keep the Codespace running while you collect responses. GitHub's default idle timeout is 30 minutes, but you can set your personal Codespaces timeout up to 240 minutes in GitHub settings. If the Codespace stops from inactivity, reopen it and run `npm start` again.

## Export Submissions From Codespaces

After people submit, run this in the Codespace terminal:

```bash
npm run export
```

That creates:

```text
submissions-export.tar.gz
```

Download that file from the Codespaces file explorer. It contains the `submissions` folder with each person-named subfolder, photos, captions, and CSV.

If you need to clean existing submissions after a design or LinkedIn formatting update, run:

```bash
npm run clean-submissions
npm run export
```

That rewrites the saved captions, post cards, JSON files, and CSV before creating a fresh export.

## Public GroupMe Link With ngrok

This app is set up for an ngrok tunnel. On ngrok's free plan, your account gets one assigned dev domain, which is the closest no-domain option for a repeatable public URL.

1. Create a free ngrok account.
2. Copy and run the authtoken command from the ngrok dashboard:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

3. Start the app and public tunnel:

```bash
npm run public
```

Send the public `Forwarding` URL that ngrok prints in GroupMe. Keep the terminal open while people submit. Your Mac also needs to stay awake.

If ngrok shows an assigned dev domain in your account and you want to force that exact URL, add this to `.env`:

```text
NGROK_URL=https://your-assigned-name.ngrok-free.app
```

## Where Submissions Go

Every submission creates a person-named folder like:

```text
submissions/John Smith/
```

If two people submit the same name, the app creates `John Smith 2`, `John Smith 3`, and so on so nothing gets overwritten.

Inside each folder:

- `submission.json`: all form answers
- `social-caption.txt`: ready-to-send Instagram or LinkedIn caption
- `groupme-reply.txt`: quick confirmation message
- `post-card.html`: a simple visual post layout
- `photo-...jpg/png/webp`: required uploaded photo

The app also maintains:

- `submissions/all-submissions.csv`
- `submissions/latest-social-posts.md`

## Notes

This is not Google Forms. Browser-only forms cannot save files directly into a folder. This app can because it runs a small Node server.
