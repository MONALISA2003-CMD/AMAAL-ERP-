import { getAuth } from '../../../../lib/auth/server';

type AuthContext = {
  params: Promise<{ path: string[] }>;
};

export async function GET(request: Request, context: AuthContext) {
  return getAuth().handler().GET(request, context);
}

export async function POST(request: Request, context: AuthContext) {
  return getAuth().handler().POST(request, context);
}

export async function PUT(request: Request, context: AuthContext) {
  return getAuth().handler().PUT(request, context);
}

export async function DELETE(request: Request, context: AuthContext) {
  return getAuth().handler().DELETE(request, context);
}

export async function PATCH(request: Request, context: AuthContext) {
  return getAuth().handler().PATCH(request, context);
}
