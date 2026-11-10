ROLE_PERMISSIONS = {
    "ADMIN": [
        "hotels.approve",
        "factors.manage",
        "users.manage",
        "audit.view"
    ],

    "OWNER": [
        "reports.view",
        "forecasts.view"
    ],

    "REPRESENTATIVE": [
        "activity.create",
        "bills.upload"
    ],

    "VERIFIER": [
        "submissions.verify"
    ],

    "POLICY_ANALYST": [
        "policy.dashboard.view"
    ],

    "RESEARCHER": [
        "research.data.request"
    ]
}


def has_permission(
    role: str,
    permission: str
) -> bool:

    permissions = ROLE_PERMISSIONS.get(
        role,
        []
    )

    return permission in permissions