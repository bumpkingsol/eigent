import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ReasoningPanel } from './ReasoningPanel';
import React from 'react';

// Mock Lucide icons
vi.mock('lucide-react', () => ({
  Brain: () => <div data-testid="icon-brain">Brain</div>,
  ChevronDown: () => <div data-testid="icon-down">Down</div>,
  ChevronUp: () => <div data-testid="icon-up">Up</div>,
}));

describe('ReasoningPanel', () => {
  const thoughts = [
    'Step 1: Analyzing request',
    'Step 2: Formulating plan',
    'Step 3: Executing'
  ];

  it('renders nothing when no thoughts', () => {
    const { container } = render(<ReasoningPanel thoughts={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders collapsed state by default', () => {
    render(<ReasoningPanel thoughts={thoughts} />);
    
    // Check header
    expect(screen.getByText(/Agent reasoning/)).toBeInTheDocument();
    expect(screen.getByText('(3 steps)')).toBeInTheDocument();
    expect(screen.getByTestId('icon-down')).toBeInTheDocument();
    
    // Check content is hidden
    expect(screen.queryByText('Analyzing request')).not.toBeInTheDocument();
  });

  it('expands when clicked', async () => {
    render(<ReasoningPanel thoughts={thoughts} />);
    
    const button = screen.getByRole('button');
    fireEvent.click(button);
    
    expect(screen.getByTestId('icon-up')).toBeInTheDocument();
    // Use findBy because of animation/state update
    expect(await screen.findByText('Analyzing request')).toBeInTheDocument();
    expect(screen.getByText('Formulating plan')).toBeInTheDocument();
  });

  it('renders with agent name', () => {
    render(<ReasoningPanel thoughts={thoughts} agentName="Coder" />);
    expect(screen.getByText("Coder's reasoning")).toBeInTheDocument();
  });
});
