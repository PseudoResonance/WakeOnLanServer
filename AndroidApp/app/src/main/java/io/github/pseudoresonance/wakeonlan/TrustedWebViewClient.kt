package io.github.pseudoresonance.wakeonlan

import android.annotation.SuppressLint
import android.net.http.SslError

import android.app.AlertDialog
import android.content.SharedPreferences
import android.net.http.SslCertificate
import android.os.Build
import android.webkit.*
import androidx.preference.PreferenceManager
import androidx.security.crypto.MasterKey
import java.lang.reflect.Field
import java.security.cert.X509Certificate
import androidx.security.crypto.EncryptedFile
import java.io.File
import java.io.IOException
import java.security.cert.CertificateFactory


class TrustedWebViewClient(private val instance: MainActivity) : WebViewClient() {

    override fun onReceivedSslError(view: WebView?, handler: SslErrorHandler?, error: SslError?) {
        try {
            if (error?.certificate == null) {
                handler!!.cancel()
                displayErrorPage(view)
                return
            }
            val x509Cert: X509Certificate? = error.certificate?.let { getX509Certificate(it) }
            val storedX509Cert: X509Certificate? = getStoredCertificate()
            if (x509Cert?.equals(storedX509Cert) == true) {
                handler!!.proceed()
                return
            }
            // for SSLErrorHandler
            val builder: AlertDialog.Builder = AlertDialog.Builder(instance)
            builder.setMessage(R.string.notification_error_ssl_cert_invalid)
            builder.setPositiveButton(R.string.notification_continue_and_remember)
                { _, _ ->
                    if (x509Cert != null) {
                        writeStoredCertificate(x509Cert)
                    }
                    handler!!.proceed()
                }
            builder.setNeutralButton(R.string.notification_continue
            ) { _, _ -> handler!!.proceed() }
            builder.setNegativeButton(R.string.notification_cancel
            ) { _, _ ->
                handler!!.cancel()
                displayErrorPage(view)
            }
            val dialog: AlertDialog = builder.create()
            dialog.show()
        } catch (e: Exception) {
            handler!!.cancel()
            clearStoredCertificate()
            displayErrorPage(view)
        }
    }

    override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
        displayErrorPage(view)
    }

    private fun displayErrorPage(view: WebView?) {
        val sharedPreferences: SharedPreferences = PreferenceManager.getDefaultSharedPreferences(instance)
        val url: String? = sharedPreferences.getString(SettingsActivity.KEY_URL, "https://wol.local/")
        val htmlData = "<html><body><div align=\"center\">Unable to access page\n$url</div></body>"

        view?.loadUrl("about:blank")
        view?.loadDataWithBaseURL(null,htmlData, "text/html", "UTF-8",null)
        view?.invalidate()
    }

    @SuppressLint("DiscouragedPrivateApi")
    private fun getX509Certificate(certificate: SslCertificate): X509Certificate? {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            return certificate.x509Certificate
        }
        val f: Field = certificate.javaClass.getDeclaredField("mX509Certificate")
        f.isAccessible = true
        return f.get(certificate) as X509Certificate?
    }

    private fun getStoredCertificate(): X509Certificate? {
        try {
            val builder: MasterKey.Builder = MasterKey.Builder(instance)
            builder.setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            val masterKey: MasterKey = builder.build()

            val file = File(instance.filesDir, "saved_certificate")
            val encryptedFile: EncryptedFile = EncryptedFile.Builder(
                instance,
                file,
                masterKey,
                EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
            ).build()
            // read the encrypted file
            val encryptedInputStream = encryptedFile.openFileInput()

            val certificateFactory = CertificateFactory.getInstance("X.509")
            val certificate = certificateFactory.generateCertificate(encryptedInputStream) as X509Certificate
            encryptedInputStream.close()
            return certificate
        } catch (e: IOException) {
            return null
        }
    }

    private fun clearStoredCertificate() {
        val file = File(instance.filesDir, "saved_certificate")
        file.delete()
    }

    private fun writeStoredCertificate(certificate: X509Certificate) {
        val builder: MasterKey.Builder = MasterKey.Builder(instance)
        builder.setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        val masterKey: MasterKey = builder.build()

        val file = File(instance.filesDir, "saved_certificate")
        file.delete()
        val encryptedFile: EncryptedFile = EncryptedFile.Builder(
            instance,
            file,
            masterKey,
            EncryptedFile.FileEncryptionScheme.AES256_GCM_HKDF_4KB
        ).build()
        // read the encrypted file
        val encryptedOutputStream = encryptedFile.openFileOutput()

        encryptedOutputStream.write(certificate.encoded)
        encryptedOutputStream.close()
    }

}