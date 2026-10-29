import {
	ANDROID_APP,
	ANDROID_SIGNING_CERT_SHA256,
} from "@superset/shared/constants";

export const dynamic = "force-static";

export function GET(): Response {
	return Response.json([
		{
			relation: ["delegate_permission/common.handle_all_urls"],
			target: {
				namespace: "android_app",
				package_name: ANDROID_APP.PACKAGE,
				sha256_cert_fingerprints: ANDROID_SIGNING_CERT_SHA256,
			},
		},
	]);
}
