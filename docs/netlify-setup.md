# Netlify Setup

## Subdomain

Create a CNAME with your DNS provider:

```txt
Type: CNAME
Name: indices
Value: <your-netlify-site>.netlify.app
```

Example:

```txt
indices.example.com -> simco-indices.netlify.app
```

## Netlify Build

Once the frontend is scaffolded, expected settings will be:

```txt
Base directory: frontend
Build command: npm run build
Publish directory: frontend/dist
```

## Environment Variables

Frontend-safe:

```txt
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Never expose these in the frontend:

```txt
SUPABASE_SERVICE_ROLE_KEY
SIMCOTOOLS_PRIVATE_KEY
```

