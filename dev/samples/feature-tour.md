# MDVibe feature tour

MDVibe renders **GitHub Flavored Markdown** — *fast*, ~~noisy~~ clean, and safely.
This file doubles as a manual test document.

## Text and links

Paragraph with `inline code`, a [web link](https://example.com), an autolink https://example.org,
a [link to a section](#tables) and a [link to another document](CHANGELOG-sample.md).

> A plain blockquote.
> It can span several lines.

> [!NOTE]
> Useful information that users should know.

> [!WARNING]
> Critical content demanding immediate attention.

## Lists

- First item
- Second item
  - Nested item
    - Deeper item
- Third item

1. One
2. Two
   1. Two point one
3. Three

### Tasks

- [x] Render task lists
- [ ] Ship version 1.0
- [ ] Write the release notes

## Code

```javascript
// Syntax highlighting with a Copy button.
export function greet(name) {
  const message = `Hello, ${name}!`;
  console.log(message);
  return message;
}
```

```rust
fn main() {
    let words = ["fast", "clean", "safe"];
    for w in words.iter() {
        println!("MDVibe is {w}");
    }
}
```

```python
def fib(n: int) -> int:
    """Return the n-th Fibonacci number."""
    a, b = 0, 1
    for _ in range(n):
        a, b = b, a + b
    return a
```

```
A fence without a language is still a proper code block.
	Tabs and    spaces are preserved.
```

## Tables

| Feature        | Status | Notes                       |
| :------------- | :----: | --------------------------: |
| GFM tables     |   ✅   | alignment supported         |
| Task lists     |   ✅   | read-only checkboxes        |
| Footnotes      |   ✅   | see below[^1]               |

## Unicode

Українська: Швидкий переглядач Markdown. Русский: Быстрый просмотрщик Markdown.
Emoji: 🚀 📄 ✨ — mixed scripts: Ελληνικά, 日本語, العربية.

---

[^1]: Footnotes are rendered at the end of the document.
