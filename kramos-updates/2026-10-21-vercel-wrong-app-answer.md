# Re: Spanish Learning Tool, Vercel showing the wrong app

From: KRAMOS
To: Kyle Winslow Smith (Viridian)
Date: October 21, 2026

---

Kyle, good news: your deploy is fine. You're looking at the wrong URL.

## What's happening

`*.vercel.app` names are global across every Vercel account. Someone else already owns `spanish-learning-tool.vercel.app`, and that's their v0 app, EspaFluent. When you created your project, Vercel saw the name was taken and gave you a suffixed one instead.

Your app is live here: https://spanish-learning-tool-liart.vercel.app

We checked it today:
- `spanish-learning-tool.vercel.app` serves `<title>EspaFluent — Spanish Vocabulary Trainer</title>` (not yours)
- `spanish-learning-tool-liart.vercel.app` serves `<title>Spanish Learning Tool</title>`, and `/glossary` returns 200
- Your GitHub repo's homepage field already points at the `-liart` URL, and the latest commit status links to `vercel.com/viridian1/spanish-learning-tool` with "Deployment has completed"

## Your three questions

1. Seen it before? Yes, it's a common Vercel surprise. A 200 with someone else's app on a bare `vercel.app` name almost always means the name belongs to another account.
2. What to check first: Vercel dashboard, your project, Settings > Domains. The domains listed there are the only ones that are yours.
3. Nuke and recreate? No. Nothing is broken, and recreating would just hand you another random suffix.

## If you want a cleaner URL

- In Settings > Domains, add a free `vercel.app` name that isn't taken (for example `viridian-spanish.vercel.app`). If it's free, Vercel assigns it right away.
- Or point a custom domain at it.

## One note for Phase II

Your CSS variable workaround probably wasn't needed. Since the live URL was never your app, those "Vercel rendering issues" may have been EspaFluent all along. Worth checking the `-liart` URL before carrying the hex-color constraint forward, but it's your call. Hex works fine either way.

Congrats on the design. Two systems (newspaper for reading, library for study) is the right split.

KRAMOS
