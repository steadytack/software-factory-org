# Brew ratio: idea brief

One to two pages in plain language, for the people who will decide. A test fixture (acceptance scenario A), not a real project.

## The idea
A page that works out coffee and water for a brew from a ratio, and keeps favourite recipes.

## Problem
Every morning the brewer works out water from coffee (or the reverse) at a chosen ratio on a phone calculator. It takes a minute each time, and a wrong sum wastes beans, about once a week *(assumed)*.

## Outcome and success measures
The right amounts in one step, and favourite ratios kept. Success: two weeks of brews without reaching for a calculator.

## How it's done today
Weigh the coffee, open the calculator, multiply by the ratio written on a sticky note, weigh the water.

## Data
Only the brewer's own recipes (a name, grams and a ratio), kept on the phone. Nothing personal. Data class: Public.

## Risk
A wrong amount wastes one brew; nothing worse. The brewer still sees and judges the numbers before pouring.

## People and process
One person owns it and uses it, at the kitchen counter, on a phone. It replaces the calculator step and nothing else.

## Strategic fit
A small personal tool, and the factory's acceptance scenario A for a standalone app.

## Assumptions and unknowns
Assumed: the browser keeps its storage between visits (if not, recipes are lost; export and import reduce that). Unknown: whether timers would be wanted later.
