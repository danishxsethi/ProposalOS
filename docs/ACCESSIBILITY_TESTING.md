# Accessibility Testing Checklist

## WCAG AA Compliance Testing

This document provides a comprehensive checklist for testing Proposal Engine for WCAG AA compliance.

---

## 🎯 Quick Reference

| Success Criterion   | Level | Tool/Method              |
| ------------------- | ----- | ------------------------ |
| Color Contrast      | AA    | Lighthouse, axe DevTools |
| Keyboard Navigation | AA    | Manual testing           |
| Focus Indicators    | AA    | Manual testing           |
| ARIA Labels         | AA    | axe DevTools             |
| Screen Reader       | AA    | NVDA, VoiceOver          |

---

## 🖥️ NVDA (Windows) Testing

### Setup

1. Download NVDA from https://www.nvaccess.org/download/
2. Install and launch NVDA
3. Press `NVDA + N` to open NVDA menu

### Essential Keyboard Commands

| Command         | Action                             |
| --------------- | ---------------------------------- |
| `NVDA + ↑`      | Read current line                  |
| `NVDA + ↓`      | Read entire document               |
| `NVDA + Tab`    | Read current focus                 |
| `Tab`           | Move to next focusable element     |
| `Shift + Tab`   | Move to previous focusable element |
| `Enter`         | Activate button/link               |
| `Space`         | Activate button/checkbox           |
| `↑` / `↓`       | Navigate within content            |
| `H`             | Jump to next heading               |
| `Shift + H`     | Jump to previous heading           |
| `L`             | Jump to next list                  |
| `T`             | Jump to next table                 |
| `B`             | Jump to next button                |
| `F`             | Jump to next form field            |
| `NVDA + Escape` | Exit focus mode                    |

### Test Scenarios

#### 1. Navigation

- [ ] Press `H` to navigate through headings
- [ ] Verify heading hierarchy (H1 → H2 → H3)
- [ ] Press `Tab` to navigate through interactive elements
- [ ] Verify focus order is logical

#### 2. Report Page

- [ ] Navigate to report page
- [ ] Verify score is announced correctly
- [ ] Navigate through category breakdown
- [ ] Verify findings are properly labeled

#### 3. Proposal Page

- [ ] Navigate through proposal sections
- [ ] Verify pricing tiers are properly announced
- [ ] Test contact form accessibility
- [ ] Verify all buttons have descriptive labels

#### 4. Modals/Dialogs

- [ ] Open modal (e.g., contact form)
- [ ] Verify focus is trapped within modal
- [ ] Press `Escape` to close
- [ ] Verify focus returns to trigger element

---

## 🍎 VoiceOver (macOS) Testing

### Setup

1. Open System Preferences → Accessibility → VoiceOver
2. Enable VoiceOver (or press `Cmd + F5`)
3. Press `VO + Space` to interact with content

### Essential Keyboard Commands

| Command                        | Action                                 |
| ------------------------------ | -------------------------------------- |
| `VO + A`                       | Read all content                       |
| `VO + ↑`                       | Read from top                          |
| `VO + →`                       | Move to next item                      |
| `VO + ←`                       | Move to previous item                  |
| `VO + Space`                   | Activate item / Enter interaction mode |
| `Tab`                          | Move to next focusable element         |
| `Control + Option + Shift + ↓` | Enter web page content                 |
| `H`                            | Jump to next heading                   |
| `Shift + H`                    | Jump to previous heading               |
| `L`                            | Jump to next list                      |
| `T`                            | Jump to next table                     |
| `B`                            | Jump to next button                    |
| `F`                            | Jump to next form field                |
| `VO + Escape`                  | Exit interaction mode                  |

### Test Scenarios

#### 1. Navigation

- [ ] Use rotor (`VO + U`) to navigate by headings
- [ ] Verify all sections are properly labeled
- [ ] Navigate using arrow keys in interaction mode

#### 2. Report Page

- [ ] Verify overall score is announced
- [ ] Navigate through category scores
- [ ] Verify chart descriptions are meaningful

#### 3. Interactive Elements

- [ ] Test all buttons have descriptive labels
- [ ] Verify dropdown menus announce options
- [ ] Test form validation announcements

---

## ✅ Manual Testing Checklist

### Keyboard Navigation

- [ ] All interactive elements are reachable via Tab
- [ ] Focus order follows visual order
- [ ] No keyboard traps (can navigate away from all elements)
- [ ] Custom components (modals, dropdowns) support keyboard interaction
- [ ] Escape key closes modals/dropdowns

### Focus Indicators

- [ ] All focusable elements have visible focus indicators
- [ ] Focus indicators have 3:1 contrast ratio
- [ ] Focus is never removed or hidden via CSS

### Skip Links

- [ ] Skip to main content link is present
- [ ] Skip link becomes visible on focus
- [ ] Skip link works correctly

### ARIA Labels

- [ ] All icon-only buttons have `aria-label`
- [ ] All images have `alt` text (or `alt=""` for decorative)
- [ ] Form inputs have associated labels
- [ ] Error messages are associated with inputs via `aria-describedby`

### Color Contrast

- [ ] Text has 4.5:1 contrast ratio (AA)
- [ ] Large text (18px+ or 14px+ bold) has 3:1 contrast ratio
- [ ] UI components have 3:1 contrast against adjacent colors

### Responsive Design

- [ ] Content is accessible at 320px width
- [ ] No horizontal scrolling at 200% zoom
- [ ] Touch targets are 44x44px minimum

---

## 🐛 Issue Reporting Template

```markdown
### Accessibility Issue

**Page/Component:** [e.g., Report Header]

**WCAG Criterion:** [e.g., 4.1.2 Name, Role, Value]

**Severity:** [Critical / Major / Minor]

**Description:**
[Describe the issue]

**Steps to Reproduce:**

1. Navigate to [page]
2. [action]
3. [observed behavior]

**Expected Behavior:**
[Describe expected behavior]

**Screen Reader Output:**
[NVDA/VoiceOver announcement]

**Suggested Fix:**
[Proposed solution]
```

---

## 📊 Lighthouse Accessibility Audit

Run Lighthouse audit and verify:

- [ ] Score ≥ 90
- [ ] No critical issues
- [ ] All elements have discernible names
- [ ] Background/foreground colors pass contrast

### Running Lighthouse

```bash
# Via Chrome DevTools
1. Open Chrome DevTools (F12)
2. Go to Lighthouse tab
3. Select "Accessibility" category
4. Click "Analyze page load"

# Via CLI
npm install -g lighthouse
lighthouse https://claraud.com --only-categories=accessibility
```

---

## 📋 Pre-Flight Checklist

Before deploying any changes:

- [ ] Run Lighthouse accessibility audit
- [ ] Test with keyboard only (no mouse)
- [ ] Test with NVDA or VoiceOver
- [ ] Verify color contrast for new colors
- [ ] Check focus indicators for new interactive elements
- [ ] Verify ARIA labels on new icon buttons

---

## 🔗 Resources

- [WCAG 2.1 Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WAI-ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)
- [NVDA Documentation](https://www.nvaccess.org/files/nvda/documentation/userGuide.html)
- [VoiceOver Getting Started](https://www.apple.com/voiceover/info/guide/)
- [axe DevTools](https://www.deque.com/axe/devtools/)
