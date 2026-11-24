# syntax=docker/dockerfile:1
FROM debian:stable-slim

ARG TTYD_VERSION=1.7.7

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=C.UTF-8 \
    LC_ALL=C.UTF-8 \
    DISABLE_AUTOUPDATER=1 \
    PATH=/root/.local/bin:$PATH

RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates curl jq procps \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL "https://github.com/tsl0922/ttyd/releases/download/${TTYD_VERSION}/ttyd.$(uname -m)" -o /usr/local/bin/ttyd \
 && chmod +x /usr/local/bin/ttyd

RUN curl -fsSL https://claude.ai/install.sh | bash

COPY <<'EOF' /tmp/claude-defaults.json
{
  "theme": "light",
  "hasCompletedOnboarding": true,
  "projects": {
    "/work": {
      "hasTrustDialogAccepted": true,
      "hasCompletedProjectOnboarding": true
    }
  }
}
EOF

RUN [ -f /root/.claude.json ] || echo '{}' > /root/.claude.json \
 && jq -s '.[0] * .[1]' /root/.claude.json /tmp/claude-defaults.json > /tmp/claude.json \
 && mv /tmp/claude.json /root/.claude.json \
 && rm /tmp/claude-defaults.json

COPY <<'EOF' /root/.claude/settings.json
{
  "permissions": {
    "allow": ["mcp__metis-suite"]
  }
}
EOF

COPY <<'EOF' /root/.bashrc
export PATH=/root/.local/bin:$PATH
alias claude='claude --tools ToolSearch'
PS1='~/work $ '
if [ -n "$LLM_UPSTREAM_KEY" ]; then
  export ANTHROPIC_BASE_URL=https://openrouter.ai/api
  export ANTHROPIC_AUTH_TOKEN="$LLM_UPSTREAM_KEY"
  export ANTHROPIC_API_KEY=""
  MODEL="$CLAUDE_MODEL"
  export ANTHROPIC_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_OPUS_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_SONNET_MODEL="$MODEL"
  export ANTHROPIC_DEFAULT_HAIKU_MODEL="$MODEL"
  export CLAUDE_CODE_SUBAGENT_MODEL="$MODEL"
  export CLAUDE_CODE_MAX_CONTEXT_TOKENS=1000000
fi
EOF

COPY <<'EOF' /work/CLAUDE.md
# Metis Suite demo session

You are Claude Code connected to Metis Suite through the `metis` MCP server. Each session is captured as a screenshot for the Metis website, so the screen is what matters.

- Work only through the `metis` MCP tools. Never reach Metis another way: no curl, no scripts, and never read config files or tokens.
- If the `metis` tools are not available, say so in one line and stop.
- Answer in a few short lines of plain text. No headings, no tables, no long lists, no follow-up offers.
- This is a test instance of Metis seeded with sample mail, calendars and files. Treat it as a demo account.
- You may send mail, create drafts and change things when asked; it all stays inside the test instance.
EOF

WORKDIR /work
CMD ["sleep", "infinity"]
