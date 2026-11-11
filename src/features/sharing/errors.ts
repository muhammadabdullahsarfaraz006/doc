export type SharingErrorCode =
  | "unauthorized"
  | "forbidden"
  | "validation"
  | "not_found"
  | "unregistered"
  | "duplicate"
  | "self_share"
  | "unknown";

export function mapSharingRpcError(message: string): {
  code: SharingErrorCode;
  message: string;
} {
  const lower = message.toLowerCase();

  if (lower.includes("authentication required")) {
    return {
      code: "unauthorized",
      message: "Your session has expired. Please sign in again.",
    };
  }

  if (lower.includes("only the document owner")) {
    return {
      code: "forbidden",
      message: "Only the document owner can manage sharing.",
    };
  }

  if (lower.includes("no registered user found")) {
    return {
      code: "unregistered",
      message: "No registered user found with that email.",
    };
  }

  if (lower.includes("already has access")) {
    return {
      code: "duplicate",
      message: "That user already has access to this document.",
    };
  }

  if (lower.includes("share a document with yourself")) {
    return {
      code: "self_share",
      message: "You cannot share a document with yourself.",
    };
  }

  if (lower.includes("collaborator not found")) {
    return {
      code: "not_found",
      message: "Collaborator not found.",
    };
  }

  if (lower.includes("role must be")) {
    return {
      code: "validation",
      message: "Role must be Editor or Viewer.",
    };
  }

  if (lower.includes("email is required")) {
    return {
      code: "validation",
      message: "Email is required.",
    };
  }

  return {
    code: "unknown",
    message: "Sharing request failed. Please try again.",
  };
}
