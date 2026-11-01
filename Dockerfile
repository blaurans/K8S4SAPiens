# Static serious game served by nginx
FROM nginx:alpine

COPY index.html /usr/share/nginx/html/index.html
COPY cours.html /usr/share/nginx/html/cours.html
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 80
