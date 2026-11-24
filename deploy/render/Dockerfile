# Single free-tier container: Nginx + PHP-FPM + Socket.io + in-memory Redis.
# Build context: repository root.
FROM node:20-alpine AS socket
WORKDIR /socket
COPY socket/package*.json ./
RUN npm ci --omit=dev
COPY socket/index.js ./
COPY socket/config ./config

FROM php:8.3-fpm-alpine
RUN apk add --no-cache nginx redis supervisor nodejs gettext-envsubst \
        libpng libjpeg-turbo freetype libzip icu-libs libpq \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS linux-headers \
        libpng-dev libjpeg-turbo-dev freetype-dev libzip-dev icu-dev libpq-dev \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" pdo_pgsql bcmath zip gd intl opcache \
    && pecl install redis && docker-php-ext-enable redis \
    && apk del .build-deps

COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /var/www/html
COPY api/composer.json api/composer.lock ./
RUN composer install --no-dev --no-interaction --no-scripts --prefer-dist --optimize-autoloader
COPY api/ ./
RUN composer dump-autoload --no-dev --no-interaction --optimize

COPY --from=socket /socket /srv/socket
COPY deploy/render/php.ini /usr/local/etc/php/conf.d/zz-codex.ini
COPY deploy/render/php-fpm.conf /usr/local/etc/php-fpm.d/zz-codex.conf
COPY deploy/render/nginx.conf.template /etc/nginx/nginx.conf.template
COPY deploy/render/supervisord.conf /etc/supervisord.conf
COPY deploy/render/start.sh /usr/local/bin/start.sh
RUN sed -i 's/\r$//' /usr/local/bin/start.sh && chmod +x /usr/local/bin/start.sh

EXPOSE 10000
CMD ["/usr/local/bin/start.sh"]
