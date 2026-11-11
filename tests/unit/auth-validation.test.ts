import { describe, expect, it } from "vitest";

import { loginSchema, signupSchema } from "@/lib/validation/auth";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    expect(
      loginSchema.parse({
        email: "  Alex@Example.com ",
        password: "secret",
      }),
    ).toEqual({
      email: "alex@example.com",
      password: "secret",
    });
  });

  it("rejects invalid email", () => {
    expect(() =>
      loginSchema.parse({
        email: "not-an-email",
        password: "secret",
      }),
    ).toThrow();
  });

  it("rejects empty password", () => {
    expect(() =>
      loginSchema.parse({
        email: "alex@example.com",
        password: "",
      }),
    ).toThrow();
  });
});

describe("signupSchema", () => {
  it("requires a strong enough password and name", () => {
    expect(
      signupSchema.parse({
        email: "alex@example.com",
        password: "password1",
        fullName: " Alex Rivera ",
      }),
    ).toEqual({
      email: "alex@example.com",
      password: "password1",
      fullName: "Alex Rivera",
    });
  });

  it("rejects short passwords", () => {
    expect(() =>
      signupSchema.parse({
        email: "alex@example.com",
        password: "short",
        fullName: "Alex",
      }),
    ).toThrow();
  });
});
