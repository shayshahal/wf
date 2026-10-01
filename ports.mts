// ports.mts — a worktree's port and folder name from its branch, the same as worktrunk's
// `hash_port` and `sanitize` filters, without worktrunk: every prompt's URLs, the repro config and
// `wf show` need the port, and a machine without `wt` could not compute it (portability audit, 2).
// Source: worktrunk 0.76.0 src/config/expansion.rs, `string_to_port` and `sanitize_branch_name`.

const MASK = (1n << 64n) - 1n;
const rotl = (x: bigint, b: number) => ((x << BigInt(b)) | (x >> BigInt(64 - b))) & MASK;

// SipHash-1-3 with both keys 0: Rust's `DefaultHasher::new()`.
function sipHash13(bytes: number[]) {
	let v0 = 0x736f6d6570736575n;
	let v1 = 0x646f72616e646f6dn;
	let v2 = 0x6c7967656e657261n;
	let v3 = 0x7465646279746573n;
	const round = () => {
		v0 = (v0 + v1) & MASK; v1 = rotl(v1, 13); v1 ^= v0; v0 = rotl(v0, 32);
		v2 = (v2 + v3) & MASK; v3 = rotl(v3, 16); v3 ^= v2;
		v0 = (v0 + v3) & MASK; v3 = rotl(v3, 21); v3 ^= v0;
		v2 = (v2 + v1) & MASK; v1 = rotl(v1, 17); v1 ^= v2; v2 = rotl(v2, 32);
	};
	const word = (i: number, n: number) => {
		let m = 0n;
		for (let j = n - 1; j >= 0; j--) m = (m << 8n) | BigInt(bytes[i + j]);
		return m;
	};
	const whole = bytes.length - (bytes.length % 8);
	for (let i = 0; i < whole; i += 8) {
		const m = word(i, 8);
		v3 ^= m; round(); v0 ^= m;
	}
	const b = (BigInt(bytes.length & 0xff) << 56n) | word(whole, bytes.length - whole);
	v3 ^= b; round(); v0 ^= b;
	v2 ^= 0xffn;
	round(); round(); round();
	return (v0 ^ v1 ^ v2 ^ v3) & MASK;
}

// Pure: the port range 10000-19999, from the branch. Rust hashes a `str` as its UTF-8 bytes and
// then one 0xFF byte (`Hasher::write_str`), so the 0xFF is part of what is hashed.
export function hashPort(branch: string) {
	const bytes = [...Buffer.from(String(branch), 'utf8'), 0xff];
	return 10000 + Number(sipHash13(bytes) % 10000n);
}

// Pure: the branch as one path component: `/` and `\` become `-`.
export function sanitizeBranch(branch: string) {
	return String(branch).replace(/[/\\]/g, '-');
}
