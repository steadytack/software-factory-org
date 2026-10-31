# Idea card

Five questions, in your own words. "Don't know" is a fine answer. The factory turns this card into the idea brief (`idea-brief.md`) and marks what it had to assume. A form tool can collect cards: export its answers as `ideas/inbox.csv` with the column names below, and `python factory/scripts/pipeline.py capture` adds each row not yet captured. Other columns (a timestamp, an email) are ignored and never stored.

| Column | Question |
|---|---|
| `title` | *(optional)* A name for the idea, a few words |
| `problem` | What's the problem? What goes wrong or takes too long today? *(required)* |
| `who` | Who does it affect? Which team or role, and roughly how many people? |
| `today` | How is it done today? The steps, the tools, where it waits or gets redone |
| `better` | What would better look like? How would you know it worked (a number if you have one)? |
| `data` | What information does it use, and where does that information live? |
