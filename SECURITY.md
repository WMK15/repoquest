# Security Policy

RepoQuest reads and maps repositories, so path containment and command safety
are core to the project. We take reports seriously.

## Supported versions

Only the latest `main` is supported. There are no maintained release branches
yet.

## Reporting a vulnerability

Please **do not** open a public issue for security problems.

Email **waseef@seractech.co.uk** with:

- A description of the issue and its impact
- Steps to reproduce (a minimal repo or request is ideal)
- Any suggested fix, if you have one

You should receive an acknowledgement within 72 hours. Please give us a
reasonable window to ship a fix before public disclosure.

## Scope of particular interest

- Path traversal escaping a mapped repository root (`resolveInsideRoot`)
- Reading of `.env*` or other secret files through any API route
- Model output influencing filesystem paths or executed commands
- Server-side secrets (e.g. `OPENAI_API_KEY`) leaking to the client
