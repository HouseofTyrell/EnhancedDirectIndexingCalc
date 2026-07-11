import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { QualifiedPurchaserModal } from './QualifiedPurchaserModal';

describe('QualifiedPurchaserModal', () => {
  it('exposes dialog semantics and focuses the first acknowledgment', () => {
    render(<QualifiedPurchaserModal onAcknowledge={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'Important Acknowledgments' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getAllByRole('checkbox')[0]).toHaveFocus();
  });

  it('contains keyboard focus and submits only after every acknowledgment', async () => {
    const user = userEvent.setup();
    const onAcknowledge = vi.fn();
    render(<QualifiedPurchaserModal onAcknowledge={onAcknowledge} />);

    const checkboxes = screen.getAllByRole('checkbox');
    const submit = screen.getByRole('button', { name: 'I Acknowledge and Wish to Proceed' });
    expect(submit).toBeDisabled();

    for (const checkbox of checkboxes) await user.click(checkbox);
    expect(submit).toBeEnabled();

    submit.focus();
    await user.tab();
    expect(checkboxes[0]).toHaveFocus();

    await user.click(submit);
    expect(onAcknowledge).toHaveBeenCalledOnce();
  });
});
