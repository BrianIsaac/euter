import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { About, measuredMarkdown } from '../../src/ui/About.tsx';

describe('About', () => {
  it('shows the licence, the versions and the measured section from the day-one file', () => {
    const onClose = vi.fn();
    render(<About onClose={onClose} />);
    expect(screen.getByText('About Euterpe')).toBeInTheDocument();
    expect(screen.getByText(/MIT License/)).toBeInTheDocument();
    expect(screen.getByText('react')).toBeInTheDocument();
    expect(screen.getByText('Measured in the ChatGPT desktop app')).toBeInTheDocument();
    expect(measuredMarkdown()).toContain('# Day-one checks');
    expect(screen.getByText(/have not been run on this build yet/)).toBeInTheDocument();
    expect(screen.getByText('Site tools appear and run')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close about' }));
    expect(onClose).toHaveBeenCalled();
  });
});
