
# Ajaia Workspace - Engineering Constitution

Build a small, production-minded collaborative document editor.

The quality hierarchy is:

1. Correctness
2. Security
3. Persistence
4. Usability
5. Visual polish
6. Additional features

Never sacrifice authorization or data integrity for speed.

The application must be demonstrable using two independent user accounts.

The database is the source of truth for persisted documents and permissions.

The editor stores structured Tiptap JSON.

The initial file import formats are TXT and Markdown.

Real-time collaboration is explicitly out of scope.

All critical functionality must be tested before deployment.

When requirements are ambiguous, choose the simplest implementation that produces a reliable, demonstrable result.

Document assumptions and tradeoffs rather than silently inventing product behavior.

Never report an implementation as complete unless it has been verified.
