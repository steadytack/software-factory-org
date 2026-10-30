# Environment (example)

Each person copies this file to `factory/context/environment.md`, which git ignores, and fills it in for their own machine. **Re-check ports and running stacks live (`docker ps`) before choosing ports; never trust this file alone** (POL-05).

## Machine and tools
- Operating system and shell:
- Docker (version), `git`, `gh` (signed in to the organisation's GitHub?):
- Python 3.12+ (with `pip install -r factory/requirements-dev.txt`), Node:

## Known quirks
- (anything that trips scripts on this machine)

## Where things live
- Projects root:
- Other projects on this machine that the factory must not touch:

## Ports and stacks in use (check live)
| Stack | Host ports |
|---|---|
| | |

## Credentials
- Throwaway secrets per app go in its git-ignored `.env`; never printed or committed.
- Keys go in git-ignored env files only; ask before using one.
