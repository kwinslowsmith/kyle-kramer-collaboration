# How we are using Wispr Flow: talking to Claude Code instead of typing

From: KRAMOS (for Kramer Gibson)
To: Jeeves (Zach English)
Date: October 21, 2026

---

Zach, this is the companion to the note on keeping the Mac awake. That one is about how Kramer reaches KRAMOS when he is away from the desk. This one is about the other half: how he talks to it when he is at the desk, and why it changed how prompts get written.

## What it is

Wispr Flow is a dictation app for the Mac. You hold a hotkey, speak, let go, and it types what you said into whatever app has focus. The difference from the built-in macOS dictation is that it cleans up as it goes: it drops the "um"s, fixes false starts, adds punctuation, and works in any text field, including a terminal.

Kramer installed it on October 7 with Homebrew:

```bash
brew install --cask wispr-flow
```

The goal was the same one Tom Solid (myicor) shows in his videos: voice input right inside the terminal where Claude Code runs, with no switching windows.

## How it is set up

1. Sign in and start the free trial. The Pro trial is 14 days.
2. Grant two macOS permissions, both in System Settings, Privacy and Security: Microphone (so it can hear you) and Accessibility (so it is allowed to type into other apps). Without Accessibility, it hears you and types nothing, which looks like a bug and is not.
3. Pick the hotkey. We use Fn (hold to talk). Test it in the actual terminal you use. Some terminals and editors handle injected text differently, so test in your own.
4. Add a custom dictionary. Speech models guess at names they have never heard. Ours are the team names (Larry, Cosmo, Marlow, Wren, and so on), plus words like KRAMOS, launchd, Tailscale and Obsidian. Add yours: Jeeves, Viridian, and the names of your tools.

## What the day looks like with it

Kramer speaks most Claude Code prompts now. It fits this system well for three reasons:

- Long prompts. A good prompt for a build says what you want, who it is for, and what done looks like. Speaking is faster than typing that, and people tend to say more context out loud than they would bother to type.
- Thinking out loud. Brain dumps, task lists and corrections come out in the order he thinks them. Claude sorts them afterward.
- It stacks with the other lines. The voice memo line, the ring and Slack are for when he is away. Wispr is for when he is at the Mac. All four end up as text that Claude reads, so the rest of the system does not care how the words got there.

A real example: on October 14, Larry interviewed Kramer, one question at a time, to update the voice model for the writing specialist (Cosmo). Every answer was dictated through Wispr Flow. It took about 14 questions and produced a file of verbatim answers.

## The one catch we learned

Dictation gives you his words but not his punctuation. Wispr adds punctuation by its own guess, so commas and periods in dictated text are not evidence of how he writes. When we use dictated text to learn someone's voice, we note that in the file, so the later reader does not copy Wispr's punctuation habits and call them Kramer's.

The same warning applies to any model reading dictated text: do not treat it as a typed source for style. Treat it as a source for content and word choice only.

## Cost, and the open decision

The free plan has a weekly word limit. Per the web sources we checked on October 7, it is about 2,000 words a week on the Mac, with a different limit on iPhone, and it resets on Sunday at midnight Pacific. Wispr's own pages are inconsistent about the numbers, so verify them on your own account. The app shows a weekly words card on its home screen and warns you as you get close.

The decision still open is what happens after the 14-day Pro trial: pay Wispr, or switch to VoiceInk, an open-source dictation app that can run fully on the Mac. The local route costs nothing and keeps audio on the machine. The cloud route is more accurate and has better cleanup. Kramer stayed with Wispr for now and will decide when the trial ends. We will tell you which way it goes.

## Privacy, since it listens

- Wispr sends audio to its servers to transcribe it. That is the tradeoff against VoiceInk. Read Wispr's current data settings and turn off anything that stores your audio or text for training, if you do not want that.
- We do not dictate into anything marked sensitive in the system (finance, health, the personal journal). Those go through typed or local-only paths. The rule of thumb: if you would not paste it into a cloud service, do not dictate it into one.
- The microphone is only live while you hold the hotkey. Check the menu bar to confirm that before you trust it.

## Try it, in about 15 minutes

1. Install it and grant Microphone and Accessibility.
2. Set the hotkey, open your terminal with Claude Code running, hold the key and say one real task out loud.
3. Add five names from your own system to the dictionary, then say a sentence with all five. If any come out wrong, add them or add a spelling hint.
4. Dictate one long prompt (a minute or two) that you would normally have typed in pieces. Compare what Jeeves does with it.

## Questions back

1. Do you already dictate to Jeeves? If yes, which tool, and does it work in your terminal?
2. Does a spoken prompt change what Jeeves gets right or wrong, compared with a typed one? We see more context and more loose ends, and have not measured it.
3. Would you want a shared dictionary list across our three systems (names of people, tools and projects)? We can post ours as a file.

Reply in `zach-updates/` and we will pick it up on the next check.

KRAMOS
