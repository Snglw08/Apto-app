#!/usr/bin/env bash
# Verifica que un entorno recién armado funcione de punta a punta.
#
# Uso:
#   1. Levantar la app:  npm run dev     (o npm run preview para el runtime real)
#   2. En otra terminal: bash scripts/verificar-entorno.sh [URL]
#
# URL por defecto: http://localhost:3000 (next dev). Para preview usar
# http://127.0.0.1:8787.
#
# Comprueba, en este orden:
#   1. Que la app responda.
#   2. Los cuatro códigos del endpoint de reglas (400/404/500/200). El 200 con
#      las reglas del seed es lo único que confirma que el embed de PostgREST
#      del Sprint 2 está bien escrito — si estuviera mal, sale 500.
#   3. Que el código de invitación del seed resuelva al paciente correcto.
#   4. Que el rate limiter realmente limite. Se verificó que sí se aplica en
#      local, tanto con `next dev` como con `npm run preview`: 10 requests pasan
#      y del 11 sale 429. Ojo que los 2 POST de la sección 3 cuentan para el
#      mismo límite, así que el 429 suele aparecer en el request 9 de esta
#      sección, no en el 11.
#
# No toca la base ni escribe nada: son todas lecturas y un POST que falla a
# propósito con un código inexistente.

set -uo pipefail

BASE="${1:-http://localhost:3000}"
PACIENTE_DEMO="11111111-1111-4111-8111-111111111111"
UUID_INEXISTENTE="99999999-9999-4999-8999-999999999999"
CODIGO_DEMO="4821"

ok=0
fallos=0

titulo() { printf "\n\033[1m%s\033[0m\n" "$1"; }

# esperado_http <descripción> <esperado> <url> [args de curl...]
esperado_http() {
  local desc="$1" esperado="$2" url="$3"; shift 3
  local cuerpo code
  cuerpo=$(mktemp)
  code=$(curl -s -o "$cuerpo" -w "%{http_code}" "$@" "$url" 2>/dev/null)
  if [ "$code" = "$esperado" ]; then
    printf "  \033[32m✓\033[0m %-52s HTTP %s\n" "$desc" "$code"
    ok=$((ok + 1))
  else
    printf "  \033[31m✗\033[0m %-52s HTTP %s (se esperaba %s)\n" "$desc" "$code" "$esperado"
    printf "      respuesta: %s\n" "$(head -c 160 "$cuerpo")"
    fallos=$((fallos + 1))
  fi
  rm -f "$cuerpo"
}

# contiene <descripción> <texto esperado> <url>
contiene() {
  local desc="$1" esperado="$2" url="$3"
  local cuerpo
  cuerpo=$(curl -s "$url" 2>/dev/null)
  if printf '%s' "$cuerpo" | grep -q "$esperado"; then
    printf "  \033[32m✓\033[0m %-52s\n" "$desc"
    ok=$((ok + 1))
  else
    printf "  \033[31m✗\033[0m %-52s no encontré «%s»\n" "$desc" "$esperado"
    printf "      respuesta: %s\n" "$(printf '%s' "$cuerpo" | head -c 160)"
    fallos=$((fallos + 1))
  fi
}

echo "Verificando $BASE"

titulo "1. La app responde"
esperado_http "GET /" 200 "$BASE/"

titulo "2. Endpoint de reglas — los cuatro códigos"
esperado_http "id mal formado → 400 (sin tocar la base)" 400 "$BASE/api/pacientes/no-es-uuid/reglas"
esperado_http "UUID inexistente → 404" 404 "$BASE/api/pacientes/$UUID_INEXISTENTE/reglas"
esperado_http "paciente del seed → 200" 200 "$BASE/api/pacientes/$PACIENTE_DEMO/reglas"
contiene "y trae la regla 'lactosa' del seed" "lactosa" "$BASE/api/pacientes/$PACIENTE_DEMO/reglas"

titulo "3. Vinculación — el código del seed"
esperado_http "código $CODIGO_DEMO → 200" 200 "$BASE/api/vinculacion" \
  -X POST -H "Content-Type: application/json" -d "{\"codigo\":\"$CODIGO_DEMO\"}"
esperado_http "código inexistente → 404" 404 "$BASE/api/vinculacion" \
  -X POST -H "Content-Type: application/json" -d '{"codigo":"ZZZZ"}'

# El límite se comporta distinto según el entorno, y la diferencia no es un bug:
# en local el contador de miniflare es exacto (pasan 10, el resto 429), pero en
# producción la API de rate limiting de Cloudflare cuenta por centro de datos y
# es eventualmente consistente — bloquea en ráfagas irregulares, medido en ~13%
# de 60 requests. Por eso acá no se exige un corte en el request 11: se exige
# que aparezca AL MENOS un 429, que es lo que distingue "funciona flojo" de
# "no funciona".
titulo "4. Rate limiter (configurado: 10 por 60s)"
INTENTOS=30
echo "  $INTENTOS POST seguidos con un código inexistente…"
bloqueados=0
for i in $(seq 1 "$INTENTOS"); do
  c=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
    -H "Content-Type: application/json" -d '{"codigo":"ZZZZ"}' \
    "$BASE/api/vinculacion" 2>/dev/null)
  [ "$c" = "429" ] && bloqueados=$((bloqueados + 1))
done
printf "  %d de %d bloqueados con 429\n" "$bloqueados" "$INTENTOS"
if [ "$bloqueados" -gt 0 ]; then
  printf "  \033[32m✓\033[0m el límite se aplica\n"
  ok=$((ok + 1))
else
  printf "  \033[31m✗\033[0m ni un solo 429 — el límite no se está aplicando.\n"
  echo "      El código de invitación de 4 caracteres queda sin ninguna"
  echo "      protección contra fuerza bruta. Revisar 'ratelimits' en"
  echo "      wrangler.jsonc: 'simple.period' solo admite 10 o 60."
  fallos=$((fallos + 1))
fi

titulo "Resultado"
printf "  %d verificaciones ok, %d fallos\n\n" "$ok" "$fallos"
[ "$fallos" -eq 0 ] || exit 1
