#!/bin/bash
# ============================================================
# Script de despliegue - CRM Movilbro en Oracle Cloud
# Ubuntu 22.04/24.04 LTS (ARM64)
# ============================================================
set -euo pipefail

# --- CONFIGURACIÓN ---
DOMAIN="${1:-movilbro-crm.com}"
APP_USER="${2:-movilbro}"
APP_DIR="/home/${APP_USER}/crm"
NODE_VERSION="22"

echo "========================================"
echo " CRM Movilbro - Despliegue automático"
echo "========================================"
echo "Dominio: $DOMAIN"
echo "Usuario: $APP_USER"
echo "Directorio: $APP_DIR"
echo "========================================"

# 1. Actualizar sistema
echo -e "\n[1/8] Actualizando sistema..."
apt update && apt upgrade -y
apt install -y curl git ufw fail2ban unattended-upgrades

# 2. Crear usuario del sistema (no-root)
echo -e "\n[2/8] Creando usuario..."
if ! id -u "$APP_USER" >/dev/null 2>&1; then
    useradd -m -s /bin/bash "$APP_USER"
fi

# 3. Instalar Node.js 22 LTS
echo -e "\n[3/8] Instalando Node.js ${NODE_VERSION}..."
curl -fsSL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
apt install -y nodejs
corepack enable
npm install -g pm2

# 4. Instalar Nginx + Certbot (SSL)
echo -e "\n[4/8] Instalando Nginx + Certbot..."
apt install -y nginx certbot python3-certbot-nginx

# 5. Configurar firewall
echo -e "\n[5/8] Configurando firewall..."
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh
ufw allow http
ufw allow https
ufw --force enable

# 6. Configurar fail2ban (protección SSH)
echo -e "\n[6/8] Configurando fail2ban..."
cat > /etc/fail2ban/jail.local << 'F2B'
[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true
F2B
systemctl restart fail2ban

# 7. Copiar configuración Nginx
echo -e "\n[7/8] Configurando Nginx..."
cp /root/crm/deploy/nginx-crm.conf /etc/nginx/sites-available/movilbro-crm
# Make sure the upstream file doesn't create a conflict
rm -f /etc/nginx/sites-enabled/default
ln -sf /etc/nginx/sites-available/movilbro-crm /etc/nginx/sites-enabled/

# Probar configuración
nginx -t

# 8. SSL con Let's Encrypt (certbot standalone primero)
echo -e "\n[8/8] Obteniendo certificado SSL..."
systemctl stop nginx
certbot certonly --standalone -d "$DOMAIN" -d "www.$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN" || true
systemctl start nginx

# Si certbot falló, arrancar sin SSL
if [ ! -f "/etc/letsencrypt/live/$DOMAIN/fullchain.pem" ]; then
    echo "⚠️ Certbot falló. Revisa que el dominio apunte a esta IP."
    echo "   Se usará configuración sin SSL temporal."
    sed -i 's/return 301 https/return 301 http/g' /etc/nginx/sites-available/movilbro-crm
    sed -i '/ssl_/d' /etc/nginx/sites-available/movilbro-crm
    sed -i 's/listen 443 ssl http2;/listen 80;/g' /etc/nginx/sites-available/movilbro-crm
    systemctl restart nginx
fi

# Renovación automática SSL
echo "0 0,12 * * * root certbot renew --quiet --deploy-hook 'systemctl reload nginx'" > /etc/cron.d/certbot-renew

# --- INSTRUCCIONES FINALES ---
echo ""
echo "========================================"
echo " ✅ SERVER LISTO - PRÓXIMOS PASOS:"
echo "========================================"
echo ""
echo "1. Sube el código al servidor:"
echo "   (desde tu PC) scp -r movilbro-crm/* ${APP_USER}@<IP>:${APP_DIR}/"
echo ""
echo "2. Instala dependencias:"
echo "   ssh ${APP_USER}@<IP>"
echo "   cd ${APP_DIR}"
echo "   npm install --production"
echo ""
echo "3. Configura .env:"
echo "   cp .env.production .env"
echo "   nano .env   # PONER: SMTP_PASS (App Password de Google)"
echo ""
echo "4. Inicia el CRM:"
echo "   pm2 start ecosystem.config.js"
echo "   pm2 save"
echo "   pm2 startup   # (ejecutar el comando que salga)"
echo ""
echo "5. Comprueba que funciona:"
echo "   curl http://localhost:3000/health"
echo "   curl https://${DOMAIN}/health"
echo ""
echo "========================================"
