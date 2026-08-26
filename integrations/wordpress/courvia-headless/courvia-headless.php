<?php
/**
 * Plugin Name: Courvia Headless Bridge
 * Description: Páginas editoriales Courvia por REST y revalidación firmada del escaparate Next.js.
 * Version: 0.1.0
 * Requires at least: 6.5
 * Requires PHP: 8.1
 * Author: Courvia
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const COURVIA_PAGE_TYPE = 'courvia_page';

function courvia_revalidate_post( $post ) {
	static $sent = array();
	if ( isset( $sent[ $post->ID ] ) || 'publish' !== $post->post_status || ! defined( 'COURVIA_STOREFRONT_URL' ) || ! defined( 'COURVIA_REVALIDATE_SECRET' ) ) {
		return;
	}
	$sent[ $post->ID ] = true;
	$locale            = get_post_meta( $post->ID, 'courvia_locale', true ) ?: 'es';
	wp_remote_post(
		rtrim( COURVIA_STOREFRONT_URL, '/' ) . '/next/wordpress-revalidate',
		array(
			'timeout' => 5,
			'headers' => array(
				'Authorization' => 'Bearer ' . COURVIA_REVALIDATE_SECRET,
				'Content-Type'  => 'application/json',
			),
			'body'    => wp_json_encode(
				array(
					'slug'   => $post->post_name,
					'locale' => $locale,
				)
			),
		)
	);
}

/** Keep stored JSON canonical. Invalid REST writes fail closed as an empty value. */
function courvia_sanitize_json_array( $value ) {
	$decoded = json_decode( (string) $value, true );
	return is_array( $decoded ) && array_is_list( $decoded ) ? wp_json_encode( $decoded ) : '[]';
}

function courvia_sanitize_json_object( $value ) {
	$decoded = json_decode( (string) $value, true );
	return is_array( $decoded ) && ! array_is_list( $decoded ) ? wp_json_encode( $decoded ) : '{}';
}

add_action(
	'init',
	function () {
		register_post_type(
			COURVIA_PAGE_TYPE,
			array(
				'labels' => array(
					'name'          => 'Páginas Courvia',
					'singular_name' => 'Página Courvia',
					'add_new_item'  => 'Añadir página Courvia',
					'edit_item'     => 'Editar página Courvia',
				),
				'public'        => false,
				'show_ui'       => true,
				'show_in_rest'  => true,
				'rest_base'     => 'courvia-pages',
				'menu_icon'     => 'dashicons-layout',
				'supports'      => array( 'title', 'slug', 'revisions', 'custom-fields' ),
				'rewrite'       => false,
				'query_var'     => false,
			)
		);

		register_post_meta(
			COURVIA_PAGE_TYPE,
			'courvia_locale',
			array(
				'single'            => true,
				'type'              => 'string',
				'default'           => 'es',
				'sanitize_callback' => function ( $value ) {
					return in_array( $value, array( 'es', 'en', 'ar' ), true ) ? $value : 'es';
				},
				'show_in_rest'      => true,
			)
		);
		register_post_meta(
			COURVIA_PAGE_TYPE,
			'courvia_blocks',
			array(
				'single'            => true,
				'type'              => 'string',
				'default'           => '[]',
				'sanitize_callback' => 'courvia_sanitize_json_array',
				'show_in_rest'      => true,
			)
		);
		register_post_meta(
			COURVIA_PAGE_TYPE,
			'courvia_seo',
			array(
				'single'            => true,
				'type'              => 'string',
				'default'           => '{}',
				'sanitize_callback' => 'courvia_sanitize_json_object',
				'show_in_rest'      => true,
			)
		);
	}
);

/** Make locale a first-class collection parameter instead of accepting an
 * arbitrary meta_query from the public REST endpoint. */
add_filter(
	'rest_courvia_page_collection_params',
	function ( $params ) {
		$params['courvia_locale'] = array(
			'description'       => 'Locale Courvia.',
			'type'              => 'string',
			'enum'              => array( 'es', 'en', 'ar' ),
			'sanitize_callback' => 'sanitize_key',
		);
		return $params;
	}
);

add_filter(
	'rest_courvia_page_query',
	function ( $args, $request ) {
		$locale = $request->get_param( 'courvia_locale' );
		if ( is_string( $locale ) && '' !== $locale ) {
			$args['meta_query'] = array(
				array(
					'key'     => 'courvia_locale',
					'value'   => $locale,
					'compare' => '=',
				),
			);
		}
		return $args;
	},
	10,
	2
);

/** A deliberately plain migration editor. Replace this with generated native
 * Gutenberg blocks before non-technical editors move to WordPress. */
add_action(
	'add_meta_boxes_' . COURVIA_PAGE_TYPE,
	function () {
		add_meta_box(
			'courvia-page-contract',
			'Contenido estructurado Courvia',
			function ( $post ) {
				wp_nonce_field( 'courvia_page_contract', 'courvia_page_nonce' );
				$locale = get_post_meta( $post->ID, 'courvia_locale', true ) ?: 'es';
				$blocks = get_post_meta( $post->ID, 'courvia_blocks', true ) ?: '[]';
				$seo    = get_post_meta( $post->ID, 'courvia_seo', true ) ?: '{}';
				?>
				<p><label for="courvia_locale"><strong>Idioma</strong></label></p>
				<select id="courvia_locale" name="courvia_locale">
					<?php foreach ( array( 'es', 'en', 'ar' ) as $option ) : ?>
						<option value="<?php echo esc_attr( $option ); ?>" <?php selected( $locale, $option ); ?>><?php echo esc_html( $option ); ?></option>
					<?php endforeach; ?>
				</select>
				<p><label for="courvia_blocks"><strong>Bloques JSON</strong></label></p>
				<textarea class="large-text code" rows="18" id="courvia_blocks" name="courvia_blocks"><?php echo esc_textarea( $blocks ); ?></textarea>
				<p><label for="courvia_seo"><strong>SEO JSON</strong></label></p>
				<textarea class="large-text code" rows="6" id="courvia_seo" name="courvia_seo"><?php echo esc_textarea( $seo ); ?></textarea>
				<p class="description">Este formulario es el puente de migración. No se debe entregar a editores hasta sustituirlo por bloques Gutenberg generados desde el registro Courvia.</p>
				<?php
			},
			COURVIA_PAGE_TYPE,
			'normal',
			'high'
		);
	}
);

add_action(
	'save_post_' . COURVIA_PAGE_TYPE,
	function ( $post_id, $post ) {
		if ( wp_is_post_autosave( $post_id ) || wp_is_post_revision( $post_id ) ) {
			return;
		}
		if ( ! isset( $_POST['courvia_page_nonce'] ) || ! wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['courvia_page_nonce'] ) ), 'courvia_page_contract' ) ) {
			return;
		}
		if ( ! current_user_can( 'edit_post', $post_id ) ) {
			return;
		}

		$locale = isset( $_POST['courvia_locale'] ) ? sanitize_key( wp_unslash( $_POST['courvia_locale'] ) ) : 'es';
		$locale = in_array( $locale, array( 'es', 'en', 'ar' ), true ) ? $locale : 'es';
		$blocks = isset( $_POST['courvia_blocks'] ) ? courvia_sanitize_json_array( wp_unslash( $_POST['courvia_blocks'] ) ) : '[]';
		$seo    = isset( $_POST['courvia_seo'] ) ? courvia_sanitize_json_object( wp_unslash( $_POST['courvia_seo'] ) ) : '{}';
		update_post_meta( $post_id, 'courvia_locale', $locale );
		update_post_meta( $post_id, 'courvia_blocks', $blocks );
		update_post_meta( $post_id, 'courvia_seo', $seo );

		courvia_revalidate_post( $post );
	},
	10,
	2
);

/** REST clients do not submit the classic metabox nonce. This hook runs
 * after WordPress has persisted registered meta, so its webhook sees the new
 * locale and content. The per-request guard prevents a duplicate call when
 * a Gutenberg save also submitted the compatible metabox. */
add_action(
	'rest_after_insert_' . COURVIA_PAGE_TYPE,
	function ( $post ) {
		courvia_revalidate_post( $post );
	},
	10,
	1
);
