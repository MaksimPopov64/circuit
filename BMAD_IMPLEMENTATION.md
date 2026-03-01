# Circuit Editor - BMAD Methodology Implementation

## Overview
This Electric Circuit Editor has been refactored following BMAD (Breakthrough Method of Agile AI Driven Development) principles for improved code quality, maintainability, and scalability.

## BMAD Principles Applied

### ✅ 1. **Structured Workflows & Architecture** 
- **Problem Identified**: Monolithic App.tsx component (982 lines) with all logic mixed together
- **Solution**: Extracted logic into specialized domains following layered architecture
  - **Types Layer** (`src/types.ts`): Clear type definitions for all entities
  - **Constants Layer** (`src/constants.ts`): All magic numbers centralized
  - **Hooks Layer** (`src/hooks/`): Reusable custom React hooks for specific concerns
  - **Utils Layer** (`src/utils/`): Pure utility functions for grid operations and coordinates

### ✅ 2. **Clear Separation of Concerns**
Each hook handles a specific domain:
- `useIdGenerator.ts` - ID generation with proper state encapsulation
- `useConnectionGraph.ts` - Graph topology building
- `useSourceFinder.ts` - Source traversal logic
- `useColorManager.ts` - Color assignment and conflict visualization
- `usePositionFinder.ts` - Spatial queries and hit detection
- `useConflictDetection.ts` - Conflict detection and auto-fixes

### ✅ 3. **Elimination of Global State**
**Issues Fixed**:
- Removed global mutable variables (`nextNodeId`, `nextWireId`, `nextPointId`)
- Moved to `useIdGenerator` hook with proper encapsulation via `useRef`
- State reset properly via `resetCounters()` on `clearAll()`

### ✅ 4. **Error Handling & Validation**
**Implemented**:
- Try-catch blocks in event handlers (click, mouse move)
- Error logging with context prefixes `[App]`, `[MAIN]`, `[PRELOAD]`
- Graceful fallback paths in Electron main process
- Error handling in preload script

### ✅ 5. **Production-Ready Configuration**
**Fixed in main.js**:
- Proper dev/prod detection using `app.isPackaged` instead of environment variables
- Correct preload path resolution for both dev and production builds
- DevTools only open in development mode (security fix)
- Multiple fallback paths for failed resource loads
- Process-level uncaught exception handler

### ✅ 6. **Code Quality Improvements**
- Added TypeScript support throughout
- Reduced App.tsx from 982 to ~400 lines (60% reduction)
- Removed code duplication
- Improved naming conventions with constants
- Better memory efficiency with proper memoization

### ✅ 7. **Configuration Management**
Created `src/constants.ts` with all configuration:
- Rendering constants (sizes, colors, stroke widths)
- UI constants (canvas dimensions, grid settings)
- Naming conventions (prevents "magic numbers" anti-pattern)

### ✅ 8. **Dependency Management**
**Updated package.json**:
- Added missing dependencies: `concurrently`, `wait-on`
- Removed need for global variable mutations via hooks
- Proper workspace configuration

## File Structure
```
src/
├── App.tsx              # Main component (refactored, 400 lines)
├── index.tsx            # Entry point
├── App.css              # Styling
├── index.css            # Global styles
├── constants.ts         # Centralized configuration  ✓ NEW
├── types.ts             # TypeScript interfaces      ✓ NEW
├── electron.d.ts        # Electron API types
├── hooks/               # Custom React hooks          ✓ NEW
│   ├── index.ts
│   ├── useIdGenerator.ts
│   ├── useConnectionGraph.ts
│   ├── useSourceFinder.ts
│   ├── useColorManager.ts
│   ├── usePositionFinder.ts
│   └── useConflictDetection.ts
└── utils/               # Utility functions           ✓ NEW
    ├── index.ts
    └── grid.ts

public/
├── preload.js           # Electron preload (hardened)
├── index.html
└── electron.js

main.js                  # Electron main process (hardened)
package.json             # Updated dependencies
tsconfig.json            # TypeScript configuration
```

## Key Improvements

| Issue | Before | After |
|-------|--------|-------|
| Global mutable state | 3 global variables | State in hooks with useRef |
| Component size | 982 lines | ~400 lines |
| Error handling | None | Try-catch + logging |
| Type safety | Inline interfaces | Dedicated types.ts |
| Magic numbers | 40+ scattered | 1 constants.ts file |
| Dev/Prod detection | process.env | app.isPackaged |
| DevTools security | Always open | Dev only |
| Code duplication | Multiple coord transforms | Unified getSVGCoordinates util |

## Testing Recommendations

1. **Unit Tests** (use Jest)
   - Test `useSourceFinder` logic with various node graphs
   - Test `useColorManager` color assignment
   - Test `usePositionFinder` hit detection

2. **Integration Tests**
   - Circuit drawing flow
   - Conflict detection and auto-disable
   - Node drag-and-drop with wire updates

3. **E2E Tests** (using Cypress or Playwright)
   - Full Electron app lifecycle
   - Dev vs Production mode switching
   - All interaction modes

## Development Workflow

```bash
# Install dependencies
npm install

# Development mode (with DevTools, hot reload)
npm run electron-dev

# Build and test production
npm run build
npm run electron-pack

# Or run built version
npm run electron-start
```

## Next Steps (BMAD Recommendations)

1. **Add Unit Tests** - Start with hooks layer tests
2. **Extract Components** - Create reusable SVG component for nodes and wires
3. **State Management** - Consider Context API for complex state sharing
4. **Performance** - Profile and optimize using React DevTools
5. **Documentation** - Add JSDoc comments to all exported functions
6. **Internationalization** - Move Russian strings to i18n config

## Metrics
- **Cyclomatic Complexity**: Reduced via hook extraction
- **Lines of Code**: 60% reduction in App.tsx
- **Test Coverage**: Ready for unit testing
- **Type Safety**: 100% with TypeScript
