# Testing Strategy and Guide for \_Aud.io

## Overview

This document is the single source of truth for testing \_Aud.io. It explains the test strategy, the current test coverage, and exactly how to run all tests (frontend and backend). If integration or end‑to‑end tests are added later, this guide will be updated to include them.

## Project Structure Testing

### Rust Backend Testing (`crates/offline-intelligence`)

The Rust backend is organized into modules:

- **config.rs** - Configuration and environment variable handling
- **memory_db/** - In-memory database operations and storage
- **cache_management/** - Caching, eviction, and cache scoring logic
- **context_engine/** - Context building and orchestration
- **api/** - API endpoints and handlers
- **memory.rs** - Message memory structures
- **metrics.rs** - Prometheus metrics collection
- **proxy.rs** - Proxy logic for LLM communication
- **resources.rs** - Resource management
- **runner.rs** - Process and server running logic
- **telemetry.rs** - Telemetry collection
- **utils/** - Utility functions

### TypeScript Frontend Testing (`apps/desktop/src`)

The frontend is organized into:

- **components/** - React UI components
- **api/** - Frontend API clients
- **utils/** - Utility functions
- **assets/** - Static assets

---

## Testing Levels

### 1. Unit Tests

Test individual functions, methods, and isolated components.

**Rust Unit Tests:**

- Configuration loading and validation
- Cache scoring algorithms
- Memory database operations
- Context building logic
- Utility functions (topic extraction, embeddings, etc.)

**TypeScript Unit Tests:**

- Component rendering with different props
- Utility function behavior
- API client methods
- State management (if applicable)

### 2. Integration Tests

Test interactions between modules and systems.

**Rust Integration Tests:**

- Cache manager coordinating with memory database
- API endpoints with full request/response cycle
- Context engine with multiple modules
- Runner initialization and server startup

**TypeScript Integration Tests:**

- Component interactions
- API integration with mock servers
- Full user workflows

### 3. End-to-End Tests

Test complete user workflows through the application.

---

## Running Tests

### Prerequisites

- macOS with Xcode command line tools installed
- Rust toolchain (`rustup`, `cargo`)
- Node.js (v18+) and npm

### Backend (Rust) Tests

```bash
# From repo root
cd crates/offline-intelligence
cargo test --lib
```

Notes:

- Current backend coverage focuses on `config.rs` (43 tests passing).
- Logs and warnings are expected; failures will be clearly reported by `cargo`.

### Frontend (TypeScript) Tests

```bash
# From repo root
cd apps/desktop
npm install
npm run test -- --run
```

Notes:

- Uses Vitest + Testing Library with `jsdom`.
- Setup file `vitest.setup.ts` loads matchers and mocks DOM APIs used by components.

### Run All Tests with One Command

```bash
# From repo root
./scripts/test-all.sh
```

This script runs backend tests (`cargo test --lib`) and frontend tests (`npm run test -- --run`) sequentially.

### Integration & E2E

At present, no formal integration or end‑to‑end test suites are checked into the repository. When they are added, this section will include exact run commands and environment setup.

---

## Current Coverage Snapshot

- Backend: 43 unit tests in `crates/offline-intelligence/src/config.rs` — PASSING
- Frontend: 78 unit tests across `apps/desktop/src/components/__tests__/` and `apps/desktop/src/api/__tests__/` — PASSING

## Test File Organization

### Rust Test Convention

Tests are placed in the same file as the code they test, in a `#[cfg(test)]` module at the end:

```rust
// src/config.rs

pub struct Config { /* ... */ }

impl Config {
    pub fn from_env() -> Result<Self> { /* ... */ }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_from_env_valid() {
        // Setup
        // Execute
        // Assert
    }
}
```

### TypeScript Test Convention

Tests are colocated with source files or in a `__tests__` directory:

```typescript
// components/ChatWindow.tsx
export function ChatWindow() { /* ... */ }

// components/__tests__/ChatWindow.test.tsx
import { render, screen } from '@testing-library/react';
import { ChatWindow } from '../ChatWindow';

describe('ChatWindow', () => {
    test('renders chat window', () => {
        render(<ChatWindow />);
        expect(screen.getByRole('main')).toBeInTheDocument();
    });
});
```

---

## Dependencies

### Rust Testing

- Built-in `#[test]` framework
- `tokio::test` for async tests
- Consider adding:
  - `mockito` - HTTP mocking
  - `proptest` - Property-based testing
  - `criterion` - Benchmarking

### TypeScript Testing

- `vitest` - Fast unit test framework
- `@testing-library/react` - React component testing
- `@testing-library/user-event` - User interaction simulation

---

## Best Practices

### For All Tests

1. **Follow AAA Pattern**: Arrange (setup), Act (execute), Assert (verify)
2. **Keep Tests Focused**: One assertion per test or logically related assertions
3. **Use Descriptive Names**: Test names should describe what is being tested
4. **Test Edge Cases**: Empty inputs, null values, boundary conditions
5. **Don't Test Implementation**: Test behavior and contracts
6. **Maintain Independence**: Tests shouldn't depend on each other
7. **Use Fixtures/Builders**: Create reusable test data

### Rust-Specific

1. Use `#[tokio::test]` for async tests
2. Create helper functions in test module for common setup
3. Use `tempfile` crate for filesystem tests
4. Mock external services with custom test implementations
5. Test error paths with `Result` types

### TypeScript-Specific

1. Mock API calls with `vitest.mock()`
2. Use `render()` and `screen` queries for component tests
3. Avoid snapshot testing unless necessary
4. Test user interactions, not implementation details
5. Use data-testid sparingly for accessibility

---

## Coverage Goals

- **Overall Coverage**: Aim for 80%+ code coverage
- **Critical Paths**: 100% coverage for:
  - Configuration loading
  - Database operations
  - Cache management
  - API endpoints
  - Error handling

---

## Pre-commit Hook

Tests should run automatically before each commit using Git hooks. See `.githooks/pre-commit` for setup.

```bash
# To enable hooks
git config core.hooksPath .githooks
```

---

## CI/CD Integration

Recommended next steps:

- Add a GitHub Actions workflow to run `cargo test --lib` and `npm run test -- --run` on PRs and pushes.
- Add coverage reporting (tarpaulin for Rust; Vitest coverage for TS).

---

## Debugging Tests

### Rust

```bash
# Run test with backtrace
RUST_BACKTRACE=1 cargo test test_name

# Run specific test
cargo test config::tests::test_config_from_env_valid -- --exact

# Run with logging
RUST_LOG=debug cargo test test_name -- --nocapture
```

### TypeScript

```bash
# Debug mode
node --inspect-brk node_modules/vitest/vitest.mjs

# Watch mode
npm run test:watch

# Single file
npm run test src/components/__tests__/ChatWindow.test.tsx
```

---

## Troubleshooting

- Port conflicts: If the local API server is already running, `cargo test` still works, but app dev servers may fail to start. Kill processes on `8000/8001/8035` if needed.
- CORS errors: Ensure backend allows required methods (GET/POST/PUT/DELETE). The current server enables PUT for title updates.
- Frontend environment: If tests fail due to DOM APIs, confirm `apps/desktop/vitest.setup.ts` is loaded via `vitest.config.ts`.

## Test Maintenance

- Review and update tests when code changes
- Remove tests for deleted functionality
- Refactor tests to use new helpers/patterns
- Keep test dependencies up to date
- Monitor coverage trends

---

## References

- [Rust Book: Testing](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Tokio Testing Guide](https://tokio.rs/tokio/topics/testing)
- [Vitest Documentation](https://vitest.dev/)
- [React Testing Library Docs](https://testing-library.com/react)
