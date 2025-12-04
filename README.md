digraph KaargarHighLevel {
    rankdir=LR;
    splines=ortho;
    node [fontname="Helvetica", shape=box, style=filled, fillcolor="white"];
    edge [fontname="Helvetica", fontsize=10];

    // Clusters
    subgraph cluster_client {
        label="Client Side";
        style=dashed;
        color=gray;
        Browser [label="Web Browser\n(React App)", shape=rect, fillcolor="#E1F5FE"];
    }

    subgraph cluster_cloud {
        label="Cloud Infrastructure";
        style=filled;
        color="#f0f0f0";

        subgraph cluster_frontend {
            label="Frontend Host (Vercel)";
            bgcolor="white";
            StaticAssets [label="React Bundle\n(SPA)", shape=note];
        }

        subgraph cluster_backend {
            label="Backend Host (Render)";
            bgcolor="white";
            FastAPI [label="FastAPI Server\n(Python 3.10)", shape=component, fillcolor="#C8E6C9"];
        }

        subgraph cluster_data {
            label="Data & BaaS";
            bgcolor="white";
            SupabaseAuth [label="Supabase Auth\n(GoTrue)", shape=ellipse, fillcolor="#FFF9C4"];
            Postgres [label="PostgreSQL DB\n(+ PostGIS)", shape=cylinder, fillcolor="#FFCCBC"];
            Storage [label="Supabase Storage\n(S3)", shape=folder, fillcolor="#FFCCBC"];
            Redis [label="Redis Cloud\n(Cache & Pub/Sub)", shape=cylinder, fillcolor="#FFCDD2"];
        }
    }

    // Connections
    Browser -> StaticAssets [label=" 1. Load App (HTTPS)"];
    Browser -> SupabaseAuth [label=" 2. Auth/Login"];
    Browser -> FastAPI [label=" 3. API Requests (Bearer Token)"];
    Browser -> FastAPI [label=" 4. WebSocket (Realtime)", style=dashed, color=blue];
    Browser -> Storage [label=" 5. Direct File Upload", style=dotted];

    // Backend Internal Flows
    FastAPI -> Postgres [label=" asyncpg (SQL)"];
    FastAPI -> Redis [label=" redis-py (Pub/Sub + Geo)"];
    FastAPI -> SupabaseAuth [label=" JWT Verification"];
}








digraph KaargarDetailed {
    rankdir=TB;
    splines=ortho;
    node [fontname="Helvetica", fontsize=10, shape=box, style=filled];
    edge [fontname="Helvetica", fontsize=9];

    // --- FRONTEND LAYER ---
    subgraph cluster_frontend {
        label="React Frontend (Vercel)";
        style=filled;
        fillcolor="#E3F2FD";
        node [fillcolor="#BBDEFB"];

        Pages [label="Pages\n(Home, Dashboard, Wallet,\nChat, Admin)", shape=note];
        Hooks [label="Hooks\n(useNotifications)", shape=note];
        AuthSync [label="AuthSync\n(postLoginUpsert)", shape=note];
        
        Pages -> Hooks;
        Pages -> AuthSync;
    }

    // --- BACKEND LAYER ---
    subgraph cluster_backend {
        label="FastAPI Backend (Render)";
        style=filled;
        fillcolor="#E8F5E9";
        node [fillcolor="#C8E6C9"];

        Main [label="main.py\n(Entry Point)"];
        
        subgraph cluster_routers {
            label="Routers";
            style=dashed;
            AuthRouter [label="auth.py\n(Profile, Worker, Loc)"];
            JobsRouter [label="jobs.py\n(CRUD, Book, Bids, Status)"];
            SearchRouter [label="search.py\n(Geo Search)"];
            ChatRouter [label="chat.py\n(REST + WS)"];
            WalletRouter [label="wallet.py\n(Balance, Tx)"];
            AdminRouter [label="admin.py\n(KYC, Complaints)"];
            KycRouter [label="kyc.py\n(Uploads)"];
            RatingsRouter [label="ratings.py"];
        }

        Dependencies [label="dependencies.py\n(DB Pool, Redis, JWT Auth)"];
        Models [label="models.py\n(Pydantic Schemas)"];

        Main -> AuthRouter;
        Main -> JobsRouter;
        Main -> SearchRouter;
        Main -> ChatRouter;
        Main -> WalletRouter;
        Main -> AdminRouter;
        
        JobsRouter -> Dependencies;
        ChatRouter -> Dependencies;
    }

    // --- DATA LAYER ---
    subgraph cluster_db {
        label="Supabase (PostgreSQL)";
        style=filled;
        fillcolor="#FFF3E0";
        node [shape=record, fillcolor="#FFE0B2"];

        UsersTable [label="{public.users|id (uuid)|role|is_flagged}"];
        WorkerProfiles [label="{public.worker_profiles|kyc_status|rates|skills}"];
        JobsTable [label="{public.jobs|lat/lon|status|budget}"];
        BidsTable [label="{public.bids|amount|status}"];
        ChatsTable [label="{public.chats|job_id}"];
        MessagesTable [label="{public.messages|content|media}"];
        WalletTable [label="{public.wallets|balance|escrow}"];
        TransactionsTable [label="{public.wallet_transactions|type|amount}"];
        ComplaintsTable [label="{public.complaints|severity|status}"];
        KycDocsTable [label="{public.kyc_documents|path|status}"];
    }

    // --- CACHE / REALTIME LAYER ---
    subgraph cluster_redis {
        label="Redis Cloud";
        style=filled;
        fillcolor="#FFEBEE";
        node [shape=component, fillcolor="#FFCDD2"];

        RedisPubSub [label="Pub/Sub Channels:\nnotifications:{user_id}\nchat:{chat_id}"];
        RedisGeo [label="Geo Index:\nworker_locations"];
    }

    // --- FLOW CONNECTIONS ---

    // Frontend to Backend
    Pages -> AuthRouter [label="HTTP PATCH /api/me"];
    Pages -> JobsRouter [label="HTTP POST /api/jobs"];
    Pages -> SearchRouter [label="HTTP GET /api/search"];
    Hooks -> Main [label="WS /ws/notifications"];
    Pages -> ChatRouter [label="WS /ws/chat/:id"];

    // Router to DB Relationships
    AuthRouter -> UsersTable [label="Upsert"];
    AuthRouter -> WorkerProfiles [label="Update"];
    JobsRouter -> JobsTable [label="CRUD"];
    JobsRouter -> BidsTable [label="Insert/Select"];
    JobsRouter -> WalletTable [label="Lock Escrow"];
    ChatRouter -> MessagesTable [label="Insert"];
    ChatRouter -> ChatsTable [label="Select"];
    WalletRouter -> TransactionsTable [label="Select"];
    AdminRouter -> ComplaintsTable [label="Resolve/Ban"];
    KycRouter -> KycDocsTable [label="Insert"];

    // Router to Redis
    ChatRouter -> RedisPubSub [label="Publish Message"];
    JobsRouter -> RedisPubSub [label="Notify Status"];
    AuthRouter -> RedisGeo [label="GEOADD"];
    SearchRouter -> RedisGeo [label="GEORADIUS (Optional)"];

    // DB Foreign Keys (Visual Representation)
    WorkerProfiles -> UsersTable [style=dotted];
    JobsTable -> UsersTable [style=dotted];
    BidsTable -> JobsTable [style=dotted];
    MessagesTable -> ChatsTable [style=dotted];
    WalletTable -> UsersTable [style=dotted];
}