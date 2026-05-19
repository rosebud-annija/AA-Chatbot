<?php
/**
 * Libby Chatbot – WordPress Shortcode
 *
 * In functions.php einfügen (oder als kleines Plugin ablegen).
 *
 * Verwendung im Beitrag / auf der Seite:
 *   [libby_chat]
 *   [libby_chat url="https://deine-chatbot-url.com" height="620"]
 *
 * Parameter:
 *   url    — URL des laufenden Libby-Servers   (Standard: LIBBY_CHAT_URL Konstante)
 *   height — Höhe des Chatfensters in px        (Standard: 600)
 */

// Optional: URL zentral definieren (z. B. in wp-config.php):
// define( 'LIBBY_CHAT_URL', 'https://deine-chatbot-url.com' );

function libby_chat_shortcode( $atts ) {

    $atts = shortcode_atts(
        array(
            'url'    => defined( 'LIBBY_CHAT_URL' ) ? LIBBY_CHAT_URL : '',
            'height' => '600',
        ),
        $atts,
        'libby_chat'
    );

    $url    = esc_url( trim( $atts['url'] ) );
    $height = absint( $atts['height'] );

    if ( empty( $url ) ) {
        return '<p style="color:red;">Libby Shortcode: keine URL angegeben.</p>';
    }

    // Eindeutige ID für mehrere Einbettungen auf einer Seite
    $id = 'libby-chat-' . wp_unique_id();

    ob_start();
    ?>
    <div id="<?php echo esc_attr( $id ); ?>" style="
        width: 100%;
        height: <?php echo $height; ?>px;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 32px rgba(0,0,0,0.12);
        position: relative;
    ">
        <iframe
            src="<?php echo $url; ?>"
            title="Frag' Libby – Agenda Austria"
            style="width:100%; height:100%; border:none; display:block;"
            loading="lazy"
            allow="microphone"
        ></iframe>
    </div>
    <?php
    return ob_get_clean();
}

add_shortcode( 'libby_chat', 'libby_chat_shortcode' );
