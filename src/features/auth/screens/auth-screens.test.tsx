import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { hardNavigate } from "../navigation";
import { resetLeaveGuardForTests } from "../session";
import { apiError, json, mockApi, USER } from "../test-api";
import { ResetPasswordScreen, VerifyEmailScreen } from "./recovery-screens";
import { SignInScreen } from "./sign-in-screen";
import { SignUpScreen } from "./sign-up-screen";

vi.mock("../navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../navigation")>()),
  hardNavigate: vi.fn(),
}));

beforeEach(() => {
  resetLeaveGuardForTests();
  vi.mocked(hardNavigate).mockClear();
});
afterEach(() => vi.unstubAllGlobals());

async function fillSignIn(email = "user@example.com", password = "Passw0rd-x") {
  await userEvent.type(screen.getByLabelText(/Email/), email);
  await userEvent.type(screen.getByLabelText(/Password/), password);
  await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
}

describe("SignInScreen", () => {
  it("signs in with cookies and goes to the safe return path", async () => {
    const api = mockApi({
      "GET /api/v1/auth/get-session": () => json(null),
      "POST /api/v1/auth/sign-in/email": () => json({ redirect: false, token: "t", user: USER }),
    });
    renderWithProviders(<SignInScreen next="/personal/calendar" />);
    await fillSignIn();
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/personal/calendar"));
    const [call] = api.find("POST", "/api/v1/auth/sign-in/email");
    expect(call!.body).toEqual({ email: "user@example.com", password: "Passw0rd-x" });
    expect(call!.init.credentials).toBe("include");
  });

  it("ignores an off-site return path", async () => {
    mockApi({
      "GET /api/v1/auth/get-session": () => json(null),
      "POST /api/v1/auth/sign-in/email": () => json({ redirect: false, token: "t", user: USER }),
    });
    renderWithProviders(<SignInScreen next="//evil.test/x" />);
    await fillSignIn();
    await waitFor(() => expect(hardNavigate).toHaveBeenCalledWith("/personal"));
  });

  it("explains wrong credentials (401) and clears the password", async () => {
    mockApi({
      "GET /api/v1/auth/get-session": () => json(null),
      "POST /api/v1/auth/sign-in/email": () => apiError(401, "UNAUTHORIZED"),
    });
    renderWithProviders(<SignInScreen />);
    await fillSignIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Email or password is incorrect.");
    expect(screen.getByLabelText(/Password/)).toHaveValue("");
    expect(hardNavigate).not.toHaveBeenCalled();
  });

  it("offers a verification resend when sign-in is refused (403, unverified)", async () => {
    const api = mockApi({
      "GET /api/v1/auth/get-session": () => json(null),
      "POST /api/v1/auth/sign-in/email": () => apiError(403, "FORBIDDEN"),
      "POST /api/v1/auth/send-verification-email": () => json({ status: true }),
    });
    renderWithProviders(<SignInScreen />);
    await fillSignIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("verify your email first");
    await userEvent.click(screen.getByRole("button", { name: "Resend verification email" }));
    expect(await screen.findByText(/a new email is on its way/)).toBeInTheDocument();
    expect(api.find("POST", "/api/v1/auth/send-verification-email")[0]!.body).toEqual({
      email: "user@example.com",
      callbackURL: `${window.location.origin}/verify-email`,
    });
  });

  it("validates before calling the API and shows rate limiting", async () => {
    const api = mockApi({
      "GET /api/v1/auth/get-session": () => json(null),
      "POST /api/v1/auth/sign-in/email": () => apiError(429, "RATE_LIMITED"),
    });
    renderWithProviders(<SignInScreen />);
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(api.find("POST", "/api/v1/auth/sign-in/email")).toHaveLength(0);
    await fillSignIn();
    expect(await screen.findByRole("alert")).toHaveTextContent("Too many attempts");
  });
});

describe("SignUpScreen", () => {
  it("creates the account and shows verification pending (no sign-in)", async () => {
    const api = mockApi({ "POST /api/v1/auth/sign-up/email": () => json({ token: null, user: { ...USER, emailVerified: false } }) });
    renderWithProviders(<SignUpScreen />);
    await userEvent.type(screen.getByLabelText(/Name/), "Mehran");
    await userEvent.type(screen.getByLabelText(/Email/), "user@example.com");
    await userEvent.type(screen.getByLabelText(/Password/), "short");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(screen.getByText("Use 8 to 128 characters.")).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Password/), "-enough");
    await userEvent.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeInTheDocument();
    expect(api.find("POST", "/api/v1/auth/sign-up/email")[0]!.body).toEqual({
      name: "Mehran",
      email: "user@example.com",
      password: "short-enough",
      callbackURL: `${window.location.origin}/verify-email`,
    });
    expect(hardNavigate).not.toHaveBeenCalled();
  });
});

describe("ResetPasswordScreen", () => {
  it("moves the token out of the address bar and submits it with the new password", async () => {
    window.history.replaceState(null, "", "/reset-password?token=one-time");
    const api = mockApi({ "POST /api/v1/auth/reset-password": () => json({ status: true }) });
    renderWithProviders(<ResetPasswordScreen token="one-time" />);
    await waitFor(() => expect(window.location.search).toBe(""));
    await userEvent.type(screen.getByLabelText(/^New password/), "new-Passw0rd");
    await userEvent.type(screen.getByLabelText(/Repeat new password/), "new-Passw0rd");
    await userEvent.click(screen.getByRole("button", { name: "Save new password" }));
    expect(await screen.findByRole("heading", { name: "Password changed" })).toBeInTheDocument();
    expect(api.find("POST", "/api/v1/auth/reset-password")[0]!.body).toEqual({ token: "one-time", newPassword: "new-Passw0rd" });
  });

  it("shows the invalid-link state for a provider error or a rejected token", async () => {
    renderWithProviders(<ResetPasswordScreen error="INVALID_TOKEN" />);
    expect(screen.getByText(/invalid or has expired/)).toBeInTheDocument();
  });
});

describe("VerifyEmailScreen", () => {
  it("does not claim success from the redirect alone", async () => {
    mockApi({ "GET /api/v1/auth/get-session": () => json(null) });
    renderWithProviders(<VerifyEmailScreen />);
    expect(await screen.findByRole("heading", { name: "Link opened" })).toBeInTheDocument();
  });

  it("offers a resend after a failed link", () => {
    renderWithProviders(<VerifyEmailScreen error="invalid_token" />);
    expect(screen.getByRole("heading", { name: "This link didn't work" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeInTheDocument();
  });
});
