# Agent Templates

These templates provide starting points for common development patterns. The agent-generator uses these as foundations rather than creating from scratch.

## Available Templates

### Web Development
- **nextjs-app-builder**: Modern React/Next.js applications with authentication, database, and deployment
- **ui-component-builder**: Reusable component libraries with accessibility and design systems
- **api-integration-specialist**: Third-party API connections (Stripe, OpenAI, webhooks)

### Infrastructure
- **database-architect**: Schema design, migrations, query optimization for PostgreSQL/MongoDB
- **deployment-automation-specialist**: CI/CD pipelines, Vercel/Railway deployment, monitoring

## Usage Patterns

### Template Customization
1. agent-generator identifies closest match
2. Copies template structure
3. Customizes name, tools, and examples
4. Adds domain-specific knowledge

### When to Create New Templates
- Pattern used 3+ times across projects
- Complex domain requiring specialized knowledge
- Popular technology stack not covered

### Template Structure
```markdown
---
name: template-name
description: Clear trigger and examples
tools: [minimal required set]
---

# Role definition
# Decision frameworks
# Operational guidelines
# Memory integration
# Self-verification
```

## Extending Templates

To add new templates:
1. Create in this directory
2. Follow existing structure
3. Update registry.json agent_templates section
4. Test with agent-generator