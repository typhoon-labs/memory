import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@dnd-kit/abstract', () => ({
  CollisionPriority: { Normal: 1, Low: 0 },
}));

vi.mock('@dnd-kit/react', () => ({
  useDraggable: vi.fn(() => ({ ref: vi.fn(), isDragging: false })),
  useDroppable: vi.fn(() => ({ ref: vi.fn(), isDropTarget: false })),
}));

import {
  DragOverlayContent,
  DraggableFileRow,
  DroppableBreadcrumb,
  DroppableFolderRow,
  MoveErrorBanner,
} from './dnd-components';
import type { DragItem } from './use-file-move';

beforeEach(() => vi.clearAllMocks());

// ── DraggableFileRow ──────────────────────────────────────────────

describe('DraggableFileRow', () => {
  it('renders children inside a table row', () => {
    render(
      <table>
        <tbody>
          <DraggableFileRow id="file-1" isDragging={false}>
            <td>File content</td>
          </DraggableFileRow>
        </tbody>
      </table>,
    );
    expect(screen.getByText('File content')).toBeTruthy();
  });

  it('renders a tr element', () => {
    const { container } = render(
      <table>
        <tbody>
          <DraggableFileRow id="file-1" isDragging={false}>
            <td>Cell</td>
          </DraggableFileRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row).toBeTruthy();
  });

  it('applies opacity-40 class when dragging', () => {
    const { container } = render(
      <table>
        <tbody>
          <DraggableFileRow id="file-1" isDragging={true}>
            <td>Dragging</td>
          </DraggableFileRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row?.className).toContain('opacity-40');
  });

  it('does not apply opacity-40 when not dragging', () => {
    const { container } = render(
      <table>
        <tbody>
          <DraggableFileRow id="file-1" isDragging={false}>
            <td>Not dragging</td>
          </DraggableFileRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row?.className).not.toContain('opacity-40');
  });
});

// ── DroppableFolderRow ────────────────────────────────────────────

describe('DroppableFolderRow', () => {
  it('renders children inside a table row', () => {
    render(
      <table>
        <tbody>
          <DroppableFolderRow id="folder-1" isDragging={false}>
            <td>Folder content</td>
          </DroppableFolderRow>
        </tbody>
      </table>,
    );
    expect(screen.getByText('Folder content')).toBeTruthy();
  });

  it('renders a tr element', () => {
    const { container } = render(
      <table>
        <tbody>
          <DroppableFolderRow id="folder-1" isDragging={false}>
            <td>Cell</td>
          </DroppableFolderRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row).toBeTruthy();
  });

  it('applies opacity-40 class when dragging', () => {
    const { container } = render(
      <table>
        <tbody>
          <DroppableFolderRow id="folder-1" isDragging={true}>
            <td>Dragging</td>
          </DroppableFolderRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row?.className).toContain('opacity-40');
  });

  it('does not apply opacity-40 when not dragging', () => {
    const { container } = render(
      <table>
        <tbody>
          <DroppableFolderRow id="folder-1" isDragging={false}>
            <td>Not dragging</td>
          </DroppableFolderRow>
        </tbody>
      </table>,
    );
    const row = container.querySelector('tr');
    expect(row?.className).not.toContain('opacity-40');
  });
});

// ── DroppableBreadcrumb ───────────────────────────────────────────

describe('DroppableBreadcrumb', () => {
  it('renders children inside a button', () => {
    render(
      <DroppableBreadcrumb id="bc-1" path="docs/" onClick={vi.fn()}>
        Documents
      </DroppableBreadcrumb>,
    );
    expect(screen.getByText('Documents')).toBeTruthy();
    expect(screen.getByRole('button')).toBeTruthy();
  });

  it('calls onClick when clicked', async () => {
    const user = userEvent.setup();
    const handleClick = vi.fn();
    render(
      <DroppableBreadcrumb id="bc-1" path="docs/" onClick={handleClick}>
        Click me
      </DroppableBreadcrumb>,
    );
    await user.click(screen.getByRole('button'));
    expect(handleClick).toHaveBeenCalledOnce();
  });

  it('renders as a button element with type="button"', () => {
    render(
      <DroppableBreadcrumb id="bc-1" path="docs/" onClick={vi.fn()}>
        Label
      </DroppableBreadcrumb>,
    );
    const btn = screen.getByRole('button');
    expect(btn.getAttribute('type')).toBe('button');
  });
});

// ── DragOverlayContent ────────────────────────────────────────────

describe('DragOverlayContent', () => {
  it('returns null when items array is empty', () => {
    const { container } = render(<DragOverlayContent items={[]} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders single file item with title', () => {
    const items: DragItem[] = [{ type: 'file', sourceKey: 'docs/readme.md', documentId: 'doc-1', title: 'README' }];
    render(<DragOverlayContent items={items} />);
    expect(screen.getByText('README')).toBeTruthy();
    // When title exists, basename should be shown as subtitle
    expect(screen.getByText('readme.md')).toBeTruthy();
  });

  it('renders single file item with basename when no title', () => {
    const items: DragItem[] = [{ type: 'file', sourceKey: 'docs/policy.pdf', documentId: 'doc-2', title: null }];
    render(<DragOverlayContent items={items} />);
    expect(screen.getByText('policy.pdf')).toBeTruthy();
  });

  it('renders single folder item with folder name', () => {
    const items: DragItem[] = [{ type: 'folder', path: 'docs/policies/' }];
    render(<DragOverlayContent items={items} />);
    expect(screen.getByText('policies')).toBeTruthy();
  });

  it('renders multi-item overlay with count', () => {
    const items: DragItem[] = [
      { type: 'file', sourceKey: 'a.txt', documentId: 'd-1', title: null },
      { type: 'file', sourceKey: 'b.txt', documentId: 'd-2', title: null },
      { type: 'folder', path: 'c/' },
    ];
    render(<DragOverlayContent items={items} />);
    expect(screen.getByText('Moving 3 items')).toBeTruthy();
  });

  it('renders file without subtitle when title is null', () => {
    const items: DragItem[] = [{ type: 'file', sourceKey: 'report.pdf', documentId: 'doc-3', title: null }];
    const { container } = render(<DragOverlayContent items={items} />);
    // Should have primary text only, no subtitle div
    const textDivs = container.querySelectorAll('.text-xs');
    expect(textDivs.length).toBe(0);
  });
});

// ── MoveErrorBanner ───────────────────────────────────────────────

describe('MoveErrorBanner', () => {
  it('returns null when error is null', () => {
    const { container } = render(<MoveErrorBanner error={null} onDismiss={vi.fn()} />);
    expect(container.innerHTML).toBe('');
  });

  it('renders error message when error is provided', () => {
    render(<MoveErrorBanner error="Something went wrong" onDismiss={vi.fn()} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('calls onDismiss when dismiss button is clicked', async () => {
    const user = userEvent.setup();
    const handleDismiss = vi.fn();
    render(<MoveErrorBanner error="Error occurred" onDismiss={handleDismiss} />);
    await user.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(handleDismiss).toHaveBeenCalledOnce();
  });

  it('dismiss button has aria-label', () => {
    render(<MoveErrorBanner error="Error" onDismiss={vi.fn()} />);
    const btn = screen.getByRole('button', { name: 'Dismiss error' });
    expect(btn).toBeTruthy();
  });

  it('renders with destructive styling classes', () => {
    const { container } = render(<MoveErrorBanner error="Bad things" onDismiss={vi.fn()} />);
    const banner = container.firstElementChild;
    expect(banner?.className).toContain('text-destructive');
  });
});
