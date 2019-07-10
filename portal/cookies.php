<?php
if (isset($_GET['set'])) {
	header('Set-Cookie: SAMESITE_STRICT=1; SameSite=Strict');
	header('Set-Cookie : SAMESITE_LAX=1; SameSite=Lax');
	header('Set-Cookie  : NO_SAMESITE=1');
	die;
}
header('Content-type: text/plain; charset=utf-8');
echo 'Cookies: ' . implode(", ",(array_keys($_COOKIE)));