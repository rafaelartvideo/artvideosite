import { Hono } from "npm:hono";
import { logger } from "npm:hono/logger";
import { createClient } from "npm:@supabase/supabase-js@2";

const app = new Hono();

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

// Comma-separated list of allowed origins, or "*" to allow all.
// The function is already secured by JWT auth so wildcard is safe.
const allowedOriginsEnv =
  Deno.env.get("ALLOWED_ORIGIN") ?? "*";
const allowedOrigins =
  allowedOriginsEnv === "*"
    ? null
    : allowedOriginsEnv.split(",").map((s) => s.trim());

function resolveOrigin(requestOrigin: string | undefined): string {
  if (!allowedOrigins) return "*";
  if (!requestOrigin) return allowedOrigins[0] ?? "*";
  return allowedOrigins.includes(requestOrigin) ? requestOrigin : allowedOrigins[0] ?? "*";
}

const adminClient = createClient(
  supabaseUrl,
  serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

const authClient = createClient(
  supabaseUrl,
  anonKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

/* =========================================================
   CORS
   ========================================================= */

function makeCorsHeaders(requestOrigin?: string) {
  return {
    "Access-Control-Allow-Origin": resolveOrigin(requestOrigin),
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-api-version",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "600",
    "Vary": "Origin",
  };
}

function jsonResponse(
  body: unknown,
  status = 200,
  requestOrigin?: string,
) {
  return new Response(
    JSON.stringify(body),
    {
      status,
      headers: {
        ...makeCorsHeaders(requestOrigin),
        "Content-Type": "application/json",
      },
    }
  );
}

/* =========================================================
   LOG
   ========================================================= */

app.use("*", logger(console.log));

/* =========================================================
   CORS / PREFLIGHT
   ========================================================= */

app.use("*", async (c, next) => {
  const origin = c.req.header("Origin");

  console.log("[SERVER] method:", c.req.method);
  console.log("[SERVER] origin:", origin);
  console.log("[SERVER] path:", c.req.path);

  if (c.req.method === "OPTIONS") {
    console.log("[SERVER] OPTIONS preflight");
    return new Response(null, {
      status: 204,
      headers: makeCorsHeaders(origin),
    });
  }

  await next();
});

/* =========================================================
   HEALTH CHECK
   ========================================================= */

app.get(
  "/server/health",
  (c) => {
    return jsonResponse({
      status: "ok",
    });
  }
);

app.get(
  "/make-server-529bf66c/health",
  (c) => {
    return jsonResponse({
      status: "ok",
    });
  }
);

/* =========================================================
   EMPLOYEE USER HANDLER
   ========================================================= */

const employeeUserHandler = async (
  c: any
) => {
  const reqOrigin = c.req.header("Origin") as string | undefined;
  const res = (body: unknown, status = 200) => jsonResponse(body, status, reqOrigin);
  let createdUserId: string | null = null;

  try {
    /* =====================================================
       BODY
       ===================================================== */

    const body = await c.req.json();

    console.log(
      "[SERVER] FUNCTION STARTED",
      {
        action: body?.action,
      }
    );

    /* =====================================================
       AUTHENTICATION
       ===================================================== */

    const authHeader =
      c.req.header("Authorization");

    const token =
      authHeader?.replace(
        /^Bearer\s+/i,
        ""
      );

    if (!token) {
      return res(
        {
          error:
            "Usuário não autenticado.",
        },
        401
      );
    }

    const {
      data: callerData,
      error: callerError,
    } =
      await authClient.auth.getUser(
        token
      );

    if (
      callerError ||
      !callerData.user
    ) {
      console.error(
        "[SERVER] caller authentication error:",
        callerError
      );

      return res(
        {
          error:
            "Sessão inválida ou expirada.",
        },
        401
      );
    }

    const callerUserId =
      callerData.user.id;

    console.log(
      "[SERVER] authenticated user:",
      callerUserId
    );

    if (body.action === "diagnose_auth_user") {
      const { email } = body;
      const normalizedEmail = String(email ?? "").trim().toLowerCase();

      if (!normalizedEmail) {
        return res(
          {
            error: "E-mail obrigatório para diagnóstico.",
          },
          400
        );
      }

      const {
        data: usersData,
        error: usersError,
      } = await adminClient.auth.admin.listUsers();

      const authUser = usersData?.users.find(
        (user) =>
          user.email?.trim().toLowerCase() === normalizedEmail
      );

      console.log("[AUTH DIAGNOSTIC]", {
        email: normalizedEmail,
        found: !!authUser,
        id: authUser?.id,
        email_confirmed: authUser?.email_confirmed_at,
        created_at: authUser?.created_at,
        banned_until: authUser?.banned_until,
        error: usersError
          ? {
              message: usersError.message,
              status: usersError.status,
              name: usersError.name,
            }
          : null,
      });

      return res(
        {
          success: true,
          found: !!authUser,
          user: authUser
            ? {
                id: authUser.id,
                email: authUser.email,
                email_confirmed_at: authUser.email_confirmed_at,
                created_at: authUser.created_at,
                banned_until: authUser.banned_until,
              }
            : null,
          error: usersError ? usersError.message : null,
        },
        usersError ? 400 : 200
      );
    }

    /* =====================================================
       PROFILE
       ===================================================== */

    const {
      data: callerProfile,
      error: profileError,
    } =
      await adminClient
        .from("profiles")
        .select(
          "role_id,is_active"
        )
        .eq(
          "id",
          callerUserId
        )
        .maybeSingle();

    if (profileError) {
      console.error(
        "[SERVER] caller profile error:",
        profileError
      );

      return res(
        {
          error:
            "Não foi possível verificar o perfil do usuário.",
        },
        403
      );
    }

    if (
      !callerProfile?.is_active
    ) {
      return res(
        {
          error:
            "Perfil do usuário não está ativo.",
        },
        403
      );
    }

    /* =====================================================
       UPLOAD MEDIA RECORD
       
       O arquivo já foi enviado para Storage pelo frontend.
       Aqui apenas criamos o registro em public.media.

       O INSERT é feito com service_role para não depender
       da policy RLS de INSERT do navegador.
       ===================================================== */

    if (
      body.action ===
      "upload_media_record"
    ) {
      const {
        bucket_id,
        storage_path,
        file_name,
        file_size,
        mime_type,
        alt_text,
        width,
        height,
      } = body;

      console.log(
        "[SERVER] upload_media_record:",
        {
          user_id: callerUserId,
          bucket_id,
          storage_path,
          file_name,
        }
      );

      /* ---------------------------------------------------
         Validação básica
         --------------------------------------------------- */

      if (
        !bucket_id ||
        !storage_path ||
        !file_name
      ) {
        return res(
          {
            error:
              "Bucket, caminho e nome do arquivo são obrigatórios.",
          },
          400
        );
      }

      /* ---------------------------------------------------
         Buckets permitidos
         --------------------------------------------------- */

      const allowedBuckets = [
        "service-images",
        "product-images",
        "brand-images",
        "avatars",
        "public-assets",
      ];

      if (
        !allowedBuckets.includes(
          String(bucket_id)
        )
      ) {
        return res(
          {
            error:
              "Bucket de mídia não permitido.",
          },
          400
        );
      }

      /* ---------------------------------------------------
         Inserir registro em public.media
         --------------------------------------------------- */

      const {
        data: media,
        error: mediaError,
      } =
        await adminClient
          .from("media")
          .insert({
            bucket_id:
              String(bucket_id),

            storage_path:
              String(storage_path),

            file_name:
              String(file_name),

            file_size:
              typeof file_size ===
              "number"
                ? file_size
                : null,

            mime_type:
              mime_type
                ? String(mime_type)
                : null,

            alt_text:
              alt_text
                ? String(alt_text)
                : null,

            width:
              typeof width ===
              "number"
                ? width
                : null,

            height:
              typeof height ===
              "number"
                ? height
                : null,

            uploaded_by:
              callerUserId,
          })
          .select("id")
          .single();

      if (mediaError) {
        console.error(
          "[SERVER] media insert error:",
          mediaError
        );

        return res(
          {
            error:
              "Não foi possível registrar a mídia.",
            details:
              mediaError.message,
            code:
              mediaError.code,
          },
          400
        );
      }

      console.log(
        "[SERVER] media created:",
        {
          id: media.id,
          uploaded_by:
            callerUserId,
        }
      );

      return res({
        success: true,
        media_id: media.id,
        user_id: callerUserId,
      });
    }

    /* =====================================================
       VALIDAR ACTIONS DE FUNCIONÁRIO
       ===================================================== */

    if (
      body.action !==
        "create_employee_user" &&
      body.action !==
        "update_employee_user"
    ) {
      return res(
        {
          error:
            "Ação não suportada.",
        },
        400
      );
    }

    const requiredPermission =
      body.action ===
      "create_employee_user"
        ? "employees.create"
        : "employees.edit";

    console.log(
      "[SERVER] required permission:",
      requiredPermission
    );

    /* =====================================================
       PERMISSION
       ===================================================== */

    const {
      data: permission,
      error: permissionError,
    } =
      await adminClient
        .from("role_permissions")
        .select(
          "permission_id, permissions!inner(key)"
        )
        .eq(
          "role_id",
          callerProfile.role_id
        )
        .eq(
          "permissions.key",
          requiredPermission
        )
        .maybeSingle();

    if (permissionError) {
      console.error(
        "[SERVER] permission lookup error:",
        permissionError
      );

      return res(
        {
          error:
            "Não foi possível verificar a permissão do usuário.",
        },
        403
      );
    }

    if (!permission) {
      return res(
        {
          error:
            body.action ===
            "create_employee_user"
              ? "Você não possui permissão para criar usuários."
              : "Você não possui permissão para editar usuários.",
        },
        403
      );
    }

    console.log(
      "[SERVER] permission granted:",
      requiredPermission
    );

    /* =====================================================
       UPDATE EMPLOYEE
       ===================================================== */

    if (
      body.action ===
      "update_employee_user"
    ) {
      const {
        employee_id,
        role_id,
        password,
        full_name,
        cpf,
        phone,
        function_name,
        is_active,
        email,
      } = body;

      if (!employee_id) {
        return res(
          {
            error:
              "Funcionário não informado.",
          },
          400
        );
      }

      if (!role_id) {
        return res(
          {
            error:
              "Função não informada.",
          },
          400
        );
      }

      if (
        !full_name ||
        !cpf
      ) {
        return res(
          {
            error:
              "Nome e CPF são obrigatórios.",
          },
          400
        );
      }

      if (
        password &&
        String(password).length < 8
      ) {
        return res(
          {
            error:
              "A senha deve ter pelo menos 8 caracteres.",
          },
          400
        );
      }

      const {
        data: employee,
        error:
          employeeLookupError,
      } =
        await adminClient
          .from("employees")
          .select(
            "id,profile_id"
          )
          .eq(
            "id",
            employee_id
          )
          .maybeSingle();

      if (
        employeeLookupError ||
        !employee?.profile_id
      ) {
        console.error(
          "[SERVER] employee lookup error:",
          employeeLookupError
        );

        return res(
          {
            error:
              "Funcionário sem usuário Auth vinculado.",
          },
          400
        );
      }

      const {
        data: updatedRole,
        error:
          updatedRoleError,
      } =
        await adminClient
          .from("roles")
          .select(
            "id,name,is_active"
          )
          .eq(
            "id",
            role_id
          )
          .maybeSingle();

      if (
        updatedRoleError ||
        !updatedRole ||
        updatedRole.is_active === false
      ) {
        return res(
          {
            error:
              "A função selecionada não está disponível.",
          },
          400
        );
      }

      /* ---------------------------------------------------
         Atualizar senha
         --------------------------------------------------- */

      if (password) {
        const {
          error: passwordError,
        } =
          await adminClient.auth.admin.updateUserById(
            employee.profile_id,
            {
              password:
                String(password),
            }
          );

        if (passwordError) {
          console.error(
            "[SERVER] password update error:",
            passwordError
          );

          return res(
            {
              error:
                "Não foi possível atualizar a senha.",
            },
            400
          );
        }
      }

      /* ---------------------------------------------------
         Atualizar e-mail
         --------------------------------------------------- */

      if (email !== undefined) {
        const normalizedEmail =
          String(email)
            .trim()
            .replace(/\s+/g, "")
            .toLowerCase();

        if (
          !normalizedEmail
        ) {
          return res(
            {
              error:
                "O e-mail não pode ficar vazio.",
            },
            400
          );
        }

        const emailRegex =
          /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (
          !emailRegex.test(
            normalizedEmail
          )
        ) {
          return res(
            {
              error:
                "Informe um e-mail válido.",
            },
            400
          );
        }

        const {
          data: usersData,
          error: usersError,
        } =
          await adminClient.auth.admin.listUsers();

        if (usersError) {
          console.error(
            "[SERVER] list users error:",
            usersError
          );

          return res(
            {
              error:
                "Não foi possível verificar o e-mail.",
            },
            400
          );
        }

        const duplicate =
          usersData.users.find(
            (user) =>
              user.id !==
                employee.profile_id &&
              user.email
                ?.toLowerCase() ===
                normalizedEmail
          );

        if (duplicate) {
          return res(
            {
              error:
                "E-mail já cadastrado.",
            },
            400
          );
        }

        const {
          error: emailUpdateError,
        } =
          await adminClient.auth.admin.updateUserById(
            employee.profile_id,
            {
              email:
                normalizedEmail,
            }
          );

        if (emailUpdateError) {
          console.error(
            "[SERVER] email update error:",
            emailUpdateError
          );

          return res(
            {
              error:
                "Não foi possível atualizar o e-mail.",
            },
            400
          );
        }
      }

      /* ---------------------------------------------------
         Atualizar profile
         --------------------------------------------------- */

      const {
        error:
          profileUpdateError,
      } =
        await adminClient
          .from("profiles")
          .update({
            full_name:
              String(
                full_name
              ).trim(),

            role_id,

            is_active:
              is_active !== false,
          })
          .eq(
            "id",
            employee.profile_id
          );

      if (profileUpdateError) {
        console.error(
          "[SERVER] profile update error:",
          profileUpdateError
        );

        return res(
          {
            error:
              "Não foi possível atualizar a função do perfil.",
          },
          400
        );
      }

      /* ---------------------------------------------------
         Atualizar employee
         --------------------------------------------------- */

      const {
        error:
          employeeUpdateError,
      } =
        await adminClient
          .from("employees")
          .update({
            full_name:
              String(
                full_name
              ).trim(),

            cpf:
              String(cpf).replace(
                /\D/g,
                ""
              ),

            phone:
              phone
                ? String(
                    phone
                  ).trim()
                : null,

            function_name:
              function_name ||
              updatedRole.name,

            role_id,

            is_active:
              is_active !== false,
          })
          .eq(
            "id",
            employee_id
          );

      if (employeeUpdateError) {
        console.error(
          "[SERVER] employee update error:",
          employeeUpdateError
        );

        return res(
          {
            error:
              "Não foi possível atualizar os dados do funcionário.",
          },
          400
        );
      }

      console.log(
        "[SERVER] employee updated:",
        employee.profile_id
      );

      return res({
        success: true,
      });
    }

    /* =====================================================
       CREATE EMPLOYEE
       ===================================================== */

    const {
      email,
      password,
      full_name,
      cpf,
      phone,
      function_name,
      role_id,
    } = body;

    if (
      !email ||
      !password ||
      !full_name ||
      !cpf ||
      !role_id
    ) {
      return res(
        {
          error:
            "Nome, CPF, e-mail, senha e função são obrigatórios.",
        },
        400
      );
    }

    if (
      String(password).length < 8
    ) {
      return res(
        {
          error:
            "A senha deve ter pelo menos 8 caracteres.",
        },
        400
      );
    }

    const {
      data: role,
      error: roleError,
    } =
      await adminClient
        .from("roles")
        .select(
          "id,name,is_active"
        )
        .eq(
          "id",
          role_id
        )
        .maybeSingle();

    if (
      roleError ||
      !role ||
      role.is_active === false
    ) {
      console.error(
        "[SERVER] role lookup error:",
        roleError
      );

      return res(
        {
          error:
            "A função selecionada não está disponível.",
        },
        400
      );
    }

    const normalizedEmail =
      String(email)
        .trim()
        .toLowerCase();

    const {
      data: authData,
      error: authError,
    } =
      await adminClient.auth.admin.createUser(
        {
          email:
            normalizedEmail,

          password:
            String(password),

          email_confirm:
            true,
        }
      );

    if (
      authError ||
      !authData.user
    ) {
      console.error(
        "[SERVER] Auth user creation error:",
        authError
      );

      return res(
        {
          error:
            authError?.message
              ?.toLowerCase()
              .includes(
                "already"
              )
              ? "E-mail já cadastrado."
              : "Não foi possível criar o usuário.",
        },
        400
      );
    }

    createdUserId =
      authData.user.id;

    console.log(
      "[CREATE EMPLOYEE] Auth user created",
      {
        id: authData.user?.id,
        email: authData.user?.email,
        email_confirmed_at:
          authData.user?.email_confirmed_at,
      }
    );

    console.log(
      "[CREATE EMPLOYEE] email confirmed",
      {
        email: normalizedEmail,
        email_confirmed_at:
          authData.user?.email_confirmed_at,
      }
    );

    /* ---------------------------------------------------
       PROFILE
       --------------------------------------------------- */

    console.log(
      "[SERVER] creating profile:",
      {
        auth_user_id:
          createdUserId,
      }
    );

    const {
      data: createdProfile,
      error: newProfileError,
    } =
      await adminClient
        .from("profiles")
        .upsert({
          id:
            createdUserId,

          full_name:
            String(
              full_name
            ).trim(),

          role_id,

          is_active:
            true,
        })
        .select("id")
        .single();

    console.log(
      "[SERVER] profile result:",
      {
        data: createdProfile,
        error: newProfileError,
      }
    );

    if (
      newProfileError ||
      !createdProfile
    ) {
      console.error(
        "[SERVER] profile creation failed:",
        {
          auth_user_id:
            createdUserId,
          error: newProfileError,
        }
      );

      throw new Error(
        newProfileError?.message ||
          "Não foi possível criar o perfil do funcionário."
      );
    }

    if (
      createdProfile.id !==
      createdUserId
    ) {
      throw new Error(
        "O ID do profile criado não corresponde ao usuário Auth."
      );
    }

    console.log(
      "[SERVER] profile confirmed:",
      {
        auth_user_id:
          createdUserId,
        profile_id:
          createdProfile.id,
      }
    );

    console.log(
      "[CREATE EMPLOYEE] profile created",
      {
        auth_user_id:
          createdUserId,
        profile_id:
          createdProfile.id,
      }
    );

    /* ---------------------------------------------------
       EMPLOYEE
       --------------------------------------------------- */

    const {
      error: employeeError,
    } =
      await adminClient
        .from("employees")
        .insert({
          profile_id:
            createdProfile.id,

          full_name:
            String(
              full_name
            ).trim(),

          cpf:
            String(cpf).replace(
              /\D/g,
              ""
            ),

          phone:
            phone
              ? String(
                  phone
                ).trim()
              : null,

          function_name:
            function_name ||
            role.name,

          role_id,

          is_active:
            true,
        });

    if (employeeError) {
      console.error(
        "[SERVER] employee creation failed:",
        {
          profile_id:
            createdProfile.id,
          error:
            employeeError,
        }
      );

      throw new Error(
        employeeError.message ||
          "Não foi possível criar o funcionário."
      );
    }

    console.log(
      "[SERVER] employee created successfully:",
      {
        user_id:
          createdUserId,

        role_id,

        role_name:
          role.name,
      }
    );

    console.log(
      "[CREATE EMPLOYEE] employee created",
      {
        user_id:
          createdUserId,
        profile_id:
          createdProfile.id,
        role_id,
      }
    );

    return res({
      success: true,
      user_id:
        createdUserId,
    });
  } catch (error) {
    /* =====================================================
       ROLLBACK
       ===================================================== */

    if (createdUserId) {
      console.log(
        "[SERVER] rolling back created user:",
        createdUserId
      );

      await adminClient
        .from("employees")
        .delete()
        .eq(
          "profile_id",
          createdUserId
        );

      await adminClient
        .from("profiles")
        .delete()
        .eq(
          "id",
          createdUserId
        );

      await adminClient.auth.admin.deleteUser(
        createdUserId
      );
    }

    console.error(
      "[SERVER] create employee user error:",
      error
    );

    return res(
      {
        error:
          error instanceof Error
            ? error.message
            : "Não foi possível executar a operação.",
      },
      400
    );
  }
};

/* =========================================================
   ROUTES
   ========================================================= */

app.post(
  "/server",
  employeeUserHandler
);

app.post(
  "/",
  employeeUserHandler
);

/* =========================================================
   404
   ========================================================= */

app.notFound(
  (c) => {
    console.log(
      "[SERVER] 404:",
      c.req.method,
      c.req.path
    );

    return res(
      {
        error:
          "Rota não encontrada.",
        method:
          c.req.method,
        path:
          c.req.path,
      },
      404
    );
  }
);

/* =========================================================
   START
   ========================================================= */

Deno.serve(
  app.fetch
);