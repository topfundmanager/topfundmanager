// ================================================================================== //


	// # Document on Ready
	// # Document on Resize
	// # Document on Scroll
	// # Document on Load


	// # Header Settings
	// # Feature Parallax
	// # Parallax Section
	// # Feature Section
	// # Resize Feature
	// # Responsive Menu
	// # Set Equal Columns Height
	// # Video Resize
	// # Set Section Size
	// # Isotope
	// # Footer Settings
	// # Page Basic
	// # Basic Elements

// ================================================================================== //

var EUTHEM = EUTHEM || {};
var enableFeatureParallax = false;
var enableParallax = false;
var sideAreaBtnAppear = true;
var parallaxbgOffset = 2;

(function($) {

	'use strict';

	// # Document on Ready
	// ============================================================================= //
	EUTHEM.documentReady = {
		init: function(){
			EUTHEM.header.showMenuItems();
			EUTHEM.sectionSettings.init();
			EUTHEM.responsiveMenu.sideArea();
			EUTHEM.pageBasic.init();
			EUTHEM.isotope.init();
			EUTHEM.isotope.noIsoFilters();
			EUTHEM.setColumnHeight.init();
			EUTHEM.basicElements.init();
			EUTHEM.footerSettings.init();
			EUTHEM.mainMenu.init();
			EUTHEM.pageBasic.showSideAreaBtn();
			if( $('#eut-feature-section').length ){
				EUTHEM.featureSection.init();
			}
		}
	};


	// # Document on Resize
	// ============================================================================= //
		EUTHEM.documentResize = {
		init: function(){

			EUTHEM.sectionSettings.init();
			EUTHEM.responsiveMenu.sideAreaWidth( '#eut-main-menu-responsive' );
			EUTHEM.resizer.init( '.eut-feature-section-inner' );
			EUTHEM.isotope.elementSize();
			EUTHEM.basicElements.iconBox();
			EUTHEM.footerSettings.init();
			if( $('#eut-header').data('fullscreen') === 'yes' ) {
				EUTHEM.featureSection.fullScreen( '#eut-feature-section' );
			}

		}
	};


	// # Document on Scroll
	// ============================================================================= //
	EUTHEM.documentScroll = {
		init: function(){
			if( $('#eut-feature-section').length && $('#eut-feature-section').data('effect') == 'parallax' ){
				EUTHEM.featureParallax.init( '#eut-feature-section' );
			}
			EUTHEM.parallaxSection.init();
			EUTHEM.header.sticky();
			EUTHEM.featureSection.stopSlider();
			EUTHEM.pageBasic.anchorSticky();
			EUTHEM.pageBasic.onePageMenu();
			EUTHEM.pageBasic.stickySidebarScroll();
			EUTHEM.pageBasic.showSideAreaBtn();
		}
	};


	// # Document on Load
	// ============================================================================= //
	EUTHEM.documentLoad = {
		init: function(){
			EUTHEM.basicElements.iconBox();
		}
	};


	// # Header Settings
	// ============================================================================= //
	EUTHEM.header = {
		showMenuItems: function(){
			var $menuItem    = $('#eut-main-menu').find('> ul > li'),
				$menu        = $('#eut-main-menu'),
				$btn         = $('.eut-advanced-menu-button');

			$btn.on('click',function(){
				$(this).addClass('hide');
				$menu.addClass('show-menu').removeClass('hide-menu');
				$menuItem.each(function(i){
					var $that = $(this);
					if( $that.hasClass('show') ) return;
					setTimeout(function() {
						if( $menu.hasClass('hide-menu') ) return;
						$that.addClass('show');
					},250 * i );
				});
			});
		},
		sticky: function(){
			var $header              = $('#eut-header'),
				$stickyHeader        = $('#eut-inner-header'),
				$featureSection      = $('#eut-feature-section'),
				headerHeight         = $stickyHeader.height(),
				shrinkSize           = $('#eut-header-wrapper').height(),
				stickyType           = $header.data('sticky-header'),
				stickyDevice         = $header.data('device-sticky-header'),
				scroll               = $(window).scrollTop(),
				topBarHeight         = $('#eut-top-bar').length ? $('#eut-top-bar').height() : 0,
				topOffset            = topBarHeight,
				offset               = 350;

			if( $header.data('header-position') === 'below-feature' && $featureSection.length ) {
				topOffset = topBarHeight + $featureSection.height() - shrinkSize;
				offset = $featureSection.height() + 350;
			}
			if( $(window).width() + scrollBarWidth > tabletPortrait ) {

				if( stickyType === 'advanced' ) {
					advancedSticky();
				}
				if( stickyType === 'simply' ) {
					simplySticky();
				}
				if( stickyType === 'shrink' ) {
					shrink();
				}
			} else if( stickyDevice == 'yes' ) {
				simplySticky();
			}

			function advancedSticky() {

				var $menuItem    = $('#eut-main-menu').find('> ul > li'),
					$menu        = $('#eut-main-menu'),
					$btn         = $('.eut-advanced-menu-button'),
					itemLength   = $menuItem.length;

				$menu.addClass('hide-menu');

				if( scroll > topOffset ) {
					$header.addClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : 'fixed', 'top' : wpBarHeight });
					$menu.addClass('show-menu').removeClass('hide-menu');
					$btn.addClass('hide').removeClass('show');
					showMenuItems();

				} else {
					$menu.removeClass('show-menu').addClass('hide-menu');
					$header.removeClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : '', 'top' : '' });
					$menuItem.removeClass('show');
					$btn.removeClass('hide').addClass('show');
				}

				function showMenuItems(){
					$menuItem.each(function(i){
						var $that = $(this);
						if( $that.hasClass('show') ) return;
						setTimeout(function() {
							if( $menu.hasClass('hide-menu') ) return;
							$that.addClass('show');
						},250 * i );
					});
				}
			}

			function simplySticky() {

				if( scroll > topOffset ) {
					$header.addClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : 'fixed', 'top' : wpBarHeight });
				} else {
					$header.removeClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : '', 'top' : '' });
				}

			}

			function shrink() {

				if( scroll > topOffset ) {
					$header.addClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : 'fixed', 'top' : wpBarHeight, 'height': shrinkSize/2, 'line-height': shrinkSize/2 + 'px' });
					$stickyHeader.find('.eut-logo').css({ 'height': shrinkSize/2 });
					$stickyHeader.find('.eut-menu-options').css({ 'height': shrinkSize/2, 'line-height': shrinkSize/2 + 'px' });
				} else {
					$header.removeClass('eut-header-sticky');
					$stickyHeader.css({ 'position' : '', 'top' : '', 'height': shrinkSize, 'line-height': shrinkSize + 'px' });
					$stickyHeader.find('.eut-logo').css({ 'height': shrinkSize });
					$stickyHeader.find('.eut-menu-options').css({ 'height': shrinkSize, 'line-height': shrinkSize + 'px' });
				}

			}
		}
	};

	// # Feature Parallax
	// ============================================================================= //
	EUTHEM.featureParallax = {
		init: function( section ){
			var scroll          = $(window).scrollTop(),
				$section        = $( section ),
				sectionHeight   = $section.height()/2,
				$parallaxEl     = $section.find('.eut-bg-wrapper'),
				$content        = $section.find('.eut-feature-content'),
				$arrowGoTo      = $('#eut-goto-section-wrapper'),
				elementHeight   = $section.height(),
				parallaxOffset  = $section.offset().top,
				tranform        = scroll * 0.2,
				tranformOpacity = scroll/sectionHeight;

			if( ( $(window).width() + scrollBarWidth < tabletPortrait || isMobile.any() ) && enableFeatureParallax === false ) return;

			if( ( elementHeight + parallaxOffset + 100 ) > scroll ) {
				if( scroll > parallaxOffset ) {
					$parallaxEl.find('.eut-bg-image').stop(true,true).transition({ y: tranform },0);
					$content.css({  opacity: 1 - tranformOpacity });
					$arrowGoTo.stop(true,true).transition({ opacity: 1 - tranformOpacity *2 },0);
				} else {
					$parallaxEl.find('.eut-bg-image').transition({ y: 0 },0);
					$content.css({  opacity: 1 });
					$arrowGoTo.transition({ opacity: 1 },0);
				}
			}

		}
	};

	// # Parallax Section
	// ============================================================================= //
	EUTHEM.parallaxSection = {
		init: function(){
			var windowHeight = $(window).height(),
				$selector    = $('.eut-section[data-image-type="parallax"]'),
				scroll       = $(window).scrollTop();

			if( !$selector.length ) return;

			$selector.each(function(){

				var $that          = $(this),
					topPosition    = $that.offset().top,
					sectionHeight  = $that.outerHeight(),
					bgHeight       = sectionHeight * parallaxbgOffset,
					scrollPos      = topPosition - scroll,
					bgMovement     = bgHeight - sectionHeight,
					scrollMovement = windowHeight + sectionHeight,
					intPos         = scrollPos + sectionHeight,
					transformY     = ( ( ( bgMovement ) / ( scrollMovement ) ) * intPos ).toFixed(2),
					$parallaxBg    = $that.find('.eut-bg-image');

				if( isMobile.any() && enableParallax === false ) {
					$parallaxBg.css({ 'height' : '100%' });
				} else {
					$parallaxBg.css({ 'height' : bgHeight });
					if( scroll > topPosition - windowHeight && scroll < topPosition + sectionHeight ) {
						$parallaxBg.stop(true,true).transition({ y: - transformY },0);
					} else {
						$parallaxBg.stop(true,true).transition({ y: 0 },0);
					}
				}

			});

		}
	};

	// # Feature Section
	// ============================================================================= //
	EUTHEM.featureSection = {
		init: function(){
			EUTHEM.featureAnim.initPos( '#eut-feature-title' );
			EUTHEM.featureSection.featureImageLoad( '#eut-feature-section' );
			if( $('#eut-header').data('fullscreen') === 'yes' ) {
				EUTHEM.featureSection.fullScreen( '#eut-feature-section' );
			} else {
				EUTHEM.resizer.init( '.eut-feature-section-inner' );
			}
		},
		fullScreen: function( section ){
			var $featureSection = $( section ),
				windowHeight    = $(window).height(),
				headerHeight    = $('#eut-header').data('overlap') == 'no' ? $('#eut-header-wrapper').height() : 0,
				topBarHeight    = $('#eut-top-bar').length ? $('#eut-top-bar').outerHeight() : 0,
				sectionItem     = $featureSection.find('.eut-feature-section-inner').data('item'),
				sectionHeight   = windowHeight - headerHeight - topBarHeight;

			$featureSection.css( 'height', sectionHeight);
			$featureSection.find('.eut-feature-section-inner').css( 'height', sectionHeight);
			$featureSection.find('.eut-slider-item').css( 'height', sectionHeight);
			if( sectionItem === 'map' ) {
				$featureSection.find('.eut-map').css( 'height', sectionHeight);
			}
		},
		featureImageLoad: function( section ){

			var $featureSection = $( section ),
				$bgImage        = $featureSection.find('.eut-bg-image'),
				sectionItem     = $featureSection.find('.eut-feature-section-inner').data('item'),
				totalBgImage    = $bgImage.length;

			// Video Item
			if( sectionItem === 'video' ) {
				EUTHEM.featureAnim.startAnim( '#eut-feature-title' );
			}

			// Title Item
			if( sectionItem === 'title' ) {
				EUTHEM.featureAnim.startAnim( '#eut-feature-title' );
			}

			var waitImgDone = function() {
				totalBgImage--;
				if (!totalBgImage) {

					// Image Item
					if( sectionItem === 'image' ) {
						$bgImage.animate({ 'opacity' : 1 },900,function(){
							EUTHEM.featureAnim.startAnim( '#eut-feature-title' );
						});
					}

					// Slider Item
					if( sectionItem === 'slider' ) {
						EUTHEM.featureSection.featureSlider();
					}

				}
			};
			$bgImage.each(function () {
				function imageUrl(input) {
					return input.replace(/"/g,"").replace(/url\(|\)$/ig, "");
				}
				var image = new Image(),
					$that = $(this);
				image.src = imageUrl($that.css('background-image'));
				$(image).on('load',waitImgDone).on( "error", waitImgDone );
			});
		},
		featureSlider: function(){

			var $slider         = $('#eut-feature-slider'),
				$bgImage        = $slider.find('.eut-bg-image'),
				pauseHover      = $slider.attr('data-slider-pause') == 'yes' ? true : '',
				sliderSpeed     = parseInt( $slider.attr('data-slider-speed') ) ? parseInt( $slider.attr('data-slider-speed') ) : 6000,
				transition      = $slider.attr('data-slider-transition') != 'slide' ? $slider.attr('data-slider-transition') : false;

			// Init Slider
			$slider.owlCarousel({
				navigation      : false,
				pagination      : false,
				autoHeight      : false,
				slideSpeed      : 800,
				paginationSpeed : 800,
				afterAction     : EUTHEM.featureSection.sliderAction,
				singleItem      : true,
				autoPlay        : true,
				stopOnHover     : pauseHover,
				baseClass       : 'owl-carousel',
				theme           : 'eut-theme',
				transitionStyle : transition
			});

			$bgImage.animate({ 'opacity' : 1 },900,function(){
				$slider.trigger('owl.play',sliderSpeed);
			});

			// Slider Navigation
			$slider.parent().find('.eut-carousel-next').on('click',function(){
				$slider.trigger('owl.next');
			});
			$slider.parent().find('.eut-carousel-prev').on('click',function(){
				$slider.trigger('owl.prev');
			});

		},
		stopSlider: function(){
			var $scroll     = $(window).scrollTop(),
				$slider     = $('#eut-feature-slider'),
				sliderSpeed = parseInt( $slider.attr('data-slider-speed') ) ? parseInt( $slider.attr('data-slider-speed') ) : 6000;

			if( $scroll > 10 ){
				$slider.trigger('owl.stop');//Stop Carousel
			} else {
				$slider.trigger('owl.play',sliderSpeed);//Play Carousel
			}
		},
		sliderAction: function(){
			var $currentSlide      = this.$owlItems.eq(this.currentItem),
				$prevSlide         = this.$owlItems.eq(this.prevItem),
				$currentSliderItem = $currentSlide.find('.eut-feature-content'),
				$prevSliderItem    = $prevSlide.find('.eut-feature-content'),
				sliderColor        = $currentSlide.find('.eut-slider-item ').attr('data-style'),
				color              = 'eut-' + sliderColor,
				sliderArrowColor   = $currentSlide.find('.eut-slider-item').attr('data-arrow-color'),
				sliderArrowAlign   = $currentSlide.find('.eut-slider-item').attr('data-arrow-align'),
				arrowColor         = 'eut-' + sliderArrowColor,
				arrowAlign         = 'eut-align-' + sliderArrowAlign;

			// Slider Animation
			EUTHEM.featureAnim.initPos( $currentSliderItem );
			EUTHEM.featureAnim.startAnim( $currentSliderItem );

			// Set Header Color
			$('#eut-header').removeClass('eut-default eut-light eut-dark').addClass(color);

			// Set Navigation Color
			$('#eut-feature-section .eut-carousel-navigation').removeClass('eut-default eut-light eut-dark').addClass(color);

			//Set Bottom Arrow
			$('#eut-goto-section-wrapper').removeClass().addClass(arrowAlign);
			$('.eut-goto-section').removeClass().addClass('eut-goto-section eut-icon-nav-down').addClass(arrowColor);
		},
		resizeVideo: function( selector ){
			var $parent         = selector,
				$video          = $parent.find('video'),
				videoWidth      = $video.width(),
				videoHeight     = $video.height(),
				containerWidth  = $parent.outerWidth(),
				containerHeight = $parent.outerHeight(),
				newSize         = EUTHEM.featureSection.videoSettings( containerWidth, containerHeight, videoWidth, videoHeight );

			$video.width(newSize.newWidth).height(newSize.newHeight);
			// Remove Spinner
			EUTHEM.featureSection.removeSpinner( $('#eut-feature-section') );
		},
		videoSettings: function( containerWidth, containerHeight, videoWidth, videoHeight ){
			var initW = videoWidth,
				initH = videoHeight,
				ratio = initH / initW;
			videoWidth   = containerWidth;
			videoHeight  = containerWidth * ratio;
			if(videoHeight < containerHeight){
				videoHeight  = containerHeight;
				videoWidth   = videoHeight / ratio;
			}
			return {
				newWidth  : parseInt(videoWidth),
				newHeight : parseInt(videoHeight)
			};
		}
	};

	// # Resize Feature
	// ============================================================================= //
	EUTHEM.resizer = {
		init: function( section ){

			var $selector  = $( section ),
				initWidth  = tabletLandscape,
				initHeight = $selector.data('height'),
				minHeight  = 320,
				newSize    = this.calSize( initWidth, initHeight );
			if( $selector.data('item') === 'revslider' ) {
				return;
			}
			if( $(window).width() + scrollBarWidth >= initWidth ) {
				$selector.css({ 'height': initHeight, 'min-height': minHeight });
				$selector.parent().css({ 'height': initHeight, 'min-height': minHeight });
				$('#eut-feature-slider').find('.eut-slider-item ').css({ 'height': initHeight, 'min-height': minHeight });
			} else {
				$selector.css({ 'height': newSize.newHeight, 'min-height': minHeight });
				$selector.parent().css({ 'height': newSize.newHeight, 'min-height': minHeight });
				$('#eut-feature-slider').find('.eut-slider-item ').css({ 'height': newSize.newHeight, 'min-height': minHeight });
			}
		},
		calSize: function( initWidth, initHeight ){
			var ratio     = initHeight / initWidth,
				height    = $(window).width() * ratio;

			return {
				newHeight : parseInt(height)
			};
		}
	};

	// # Feature Content Animations
	// ============================================================================= //
	EUTHEM.featureAnim = {
		settings: function( section ){
			var animDelay    = 300,
				contentItems = {
					title       : $(section).find(' .eut-title '),
					description : $(section).find(' .eut-description '),
					button1     : $(section).find(' .eut-btn:first-child '),
					button2     : $(section).find(' .eut-btn:last-child ')
				};

			return { items: contentItems, delay: animDelay };
		},
		initPos: function( section ){

			var $section = $( section ),
				settings = EUTHEM.featureAnim.settings( section ),
				items    = settings.items;

			$.each( items, function( key, item ) {
				if( $section.hasClass('eut-fade-in-up') ) {
					$(item).stop(true,true).transition({ y: 200, opacity: 0 },0);
				} else if( $section.hasClass('eut-fade-in-down') ) {
					$(item).stop(true,true).transition({ y: -200, opacity: 0 },0);
				} else if( $section.hasClass('eut-fade-in-left') ) {
					$(item).stop(true,true).transition({ x: -200, opacity: 0 },0);
				} else if( $section.hasClass('eut-fade-in-right') ) {
					$(item).stop(true,true).transition({ x: 200, opacity: 0 },0);
				} else {
					$(item).stop(true,true).transition({ x: 0, opacity: 0 },0);
				}
			});

		},
		startAnim: function( section ){

			var $section = $( section ),
				settings = EUTHEM.featureAnim.settings( section ),
				items    = settings.items,
				delay    = settings.delay,
				cnt      = 1;

			$.each( items, function( key, item ) {
				cnt++;
				if( $section.hasClass('eut-fade-in-up') || $section.hasClass('eut-fade-in-down') ) {
					$(item).transition({ y: 0, opacity: 1, delay: cnt * delay },1200,'cubic-bezier(0,0.9,0.3,1)', {queue: false});
				} else if( $section.hasClass('eut-fade-in-left') || $section.hasClass('eut-fade-in-right') ) {
					$(item).transition({ x: 0, opacity: 1, delay: cnt * delay },1200,'cubic-bezier(0,0.9,0.3,1)', {queue: false});
				} else {
					$(item).transition({ x: 0, opacity: 1, delay: cnt * delay },1200,'cubic-bezier(0,0.9,0.3,1)', {queue: false});
				}
			});

		}
	};

	// # Responsive Menu
	// ============================================================================= //
	EUTHEM.responsiveMenu = {
		sideArea: function(){
			var $sideArea     = $('.eut-side-area'),
				$sideBtn      = $('.eut-toggle-sidearea'),
				$menuBtn      = $('.eut-toggle-responsive-menu'),
				$closeBtn     = $sideArea.find('.eut-close-menu-button'),
				$bodyOverlay  = $('<div id="eut-sidearea-overlay" class="eut-body-overlay"></div>'),
				$themeWrapper = $('#eut-theme-wrapper'),
				areaWidth     = 0;
			if( !$sideArea.length ) {
				return;
			}

			this.menuWidget( '#eut-main-menu-responsive .eut-menu');

			// Append Overlay on body
			$bodyOverlay.appendTo('#eut-theme-wrapper');

			$menuBtn.on('click',function(e){
				var area = '#eut-main-menu-responsive';
				// Calculate Width
				areaWidth = EUTHEM.responsiveMenu.sideAreaWidth( area );

				// Set Area side Height
				EUTHEM.responsiveMenu.sideAreaHeight( area );

				e.preventDefault();
				if( $(area).hasClass('open') ) {
					closeSideArea( area );
					$(area).removeClass('open');
				} else {
					openSideArea( area );
					$(area).addClass('open');
				}
			});

			$sideBtn.on('click',function(e){
				var area = '#eut-side-area';
				// Calculate Width
				areaWidth = EUTHEM.responsiveMenu.sideAreaWidth( area );

				// Set Area side Height
				EUTHEM.responsiveMenu.sideAreaHeight( area );

				e.preventDefault();
				if( $(area).hasClass('open') ) {
					closeSideArea( area );
					$(area).removeClass('open');
				} else {
					openSideArea( area );
					$(area).addClass('open');
				}
			});

			$closeBtn.on('click',function(e){
				e.preventDefault();
				closeSideArea();
				$sideArea.removeClass('open');
			});

			$bodyOverlay.on('click',function(){
				closeSideArea();
				$sideArea.removeClass('open');
			});

			// For One Page
			var $link = $sideArea.find('a[href*="#"]:not( [href="#"] )');
			$link.on('click',function(){
				var target = $(this.hash);
				if ( target.length && ( target.hasClass('eut-section') || target.hasClass('eut-bookmark') ) ) {
					closeSideArea();
				}
			});

			// Open Side Area
			function openSideArea( area ) {
				$bodyOverlay.fadeIn();
				$(area).stop(true, false).transition({ x: - areaWidth },900,'cubic-bezier(0,0.9,0.3,1)',function(){
					$closeBtn.stop(true, false).transition({ y: 200, delay: 200 },900,'cubic-bezier(0,0.9,0.3,1)');
				});
			}
			// Close Side Area
			function closeSideArea() {
				$themeWrapper.css({ 'height' : 'auto' });
				$sideArea.stop(true, false).transition({ x: 0 },900,'cubic-bezier(0,0.9,0.3,1)',function(){
					$closeBtn.stop(true, false).transition({ y: 0 },900,'cubic-bezier(0,0.9,0.3,1)');
					$bodyOverlay.fadeOut();
					$sideArea.css('position','').find('.eut-scroller').scrollTop( 0 );
				});
			}

		},
		sideAreaWidth: function( area ){
			var windowWidth  = $(window).width(),
				areaWidth    = windowWidth / 4,
				minWidth     = 500;
			if( $(window).width() + scrollBarWidth <= mobileScreen ) {
				areaWidth = windowWidth;
			} else if( areaWidth < minWidth ) {
				areaWidth = minWidth;
			}

			$(area).css({ 'width' : areaWidth });
			return areaWidth;
		},
		sideAreaHeight: function( area ){
			if( $(area).length ) {
				var windowHeight   = $(window).height(),
					sideAreaHeight = $(area).find('.eut-area-content').outerHeight() + 200,
					$themeWrapper  = $('#eut-theme-wrapper'),
					$scroller      = $(area).find('.eut-scroller'),
					sideHeight     = 0;

				if( sideAreaHeight > windowHeight ){
					sideHeight = sideAreaHeight;
				} else {
					sideHeight = windowHeight;
				}

				if( $(window).width() + scrollBarWidth <= mobileScreen ) {
					$scroller.css({ 'height' : 'auto' });
					$(area).css({ 'position' : 'absolute','height' : sideHeight });
					$themeWrapper.css({ 'height' : sideHeight, 'overflow' : 'hidden' });
				} else {
					$scroller.css({ 'height' : windowHeight - 150 });
					$scroller.niceScroll({autohidemode:"hidden"});
					$themeWrapper.css({ 'height' : 'auto', 'overflow' : 'visible' });
				}
			}
		},
		menuWidget: function( element ){

			var $menu     = $( element ),
				$menuItem = $menu.find('li.menu-item-has-children'),
				$arrow    = $('<i class="eut-arrow"></i>');

			// Add Arrows
			$arrow.appendTo( $menuItem );

			$menuItem.find('.eut-arrow').on('tap click', function(){
				var $that    = $(this),
					$subMenu = $that.parent().toggleClass('open').find(' > ul');
				if( $subMenu.is(':visible') ) {
					$subMenu.slideUp(200,function(){
						if( $menu.parent().is('.eut-scroller') ) {
							$menu.parent().getNiceScroll().resize();
							// Set Area side Height
							EUTHEM.responsiveMenu.sideAreaHeight( '#eut-main-menu-responsive' );
						}
					});
				} else {
					$subMenu.slideDown(200,function(){
						if( $menu.parent().is('.eut-scroller') ) {
							$menu.parent().getNiceScroll().resize();
							// Set Area side Height
							EUTHEM.responsiveMenu.sideAreaHeight( '#eut-main-menu-responsive' );
						}
					});
				}
			});

		}
	};

	// # Set Equal Columns Height
	// ============================================================================= //
	EUTHEM.setColumnHeight = {
		init : function(){
			var section = $('.eut-section.eut-custom-height');

			section.each(function(){
				var $section = $( this );
				$section.imagesLoaded('always',function(){
					var columns = $section.hasClass('eut-column-has-gap') ? $section.find('.eut-column-wrapper') : $section.find('.eut-column'),
						middle = $section.hasClass('eut-middle-content') ? true : false,
						resizeTimeout;

					if (EUTHEM.setColumnHeight.limit( $section ) ) {
						EUTHEM.setColumnHeight.updateParams( columns, middle, EUTHEM.setColumnHeight.onEnd );
					} else {
						EUTHEM.setColumnHeight.resetCol( columns );
						EUTHEM.setColumnHeight.onEnd( columns );
					}

					$(window).on('resize', function(){
						window.clearTimeout(resizeTimeout);
						resizeTimeout = window.setTimeout(function () {
							EUTHEM.setColumnHeight.resetCol( columns );
							if (EUTHEM.setColumnHeight.limit( $section ) ) {
								EUTHEM.setColumnHeight.updateParams( columns, middle, EUTHEM.setColumnHeight.onEnd );
							}
						}, 200);
					});
				});
			});
		},
		updateParams : function( columns, middle, callback ){
			var columnMaxH = 0;
			columns.each(function(){
				if( $(this).outerHeight(true) > columnMaxH ) {
					columnMaxH = $(this).outerHeight(true);
				}
			});

			for (var i = 0; i < columns.length; i++) {
				var $col = $(columns[i]);

				if( middle ) {
					EUTHEM.setColumnHeight.middleCol( $col, columnMaxH );
				} else {
					EUTHEM.setColumnHeight.equalCol( columns, columnMaxH );
				}

				if( i === columns.length - 1 && callback && typeof callback === 'function' ) {
					callback(columns);
				}

			}
		},
		getHeight : function( el ){
			var elHeight = el.outerHeight();
			return elHeight;
		},
		getMaxHeight : function( el ){
			var maxHeight = el.parents('.eut-section').height();
			return maxHeight;
		},
		equalCol : function( el, height ){
			el.css({
				'height' : height
			});
		},
		middleCol : function( el, height ){

			el.addClass('eut-reset-padding');
			if( !el.find('.eut-middle-wrapper').length ) {
				el.wrapInner( '<div class="eut-middle-wrapper"></div>' );
			}
			var $content = el.find('.eut-middle-wrapper'),
				contentH = $content.outerHeight(true),
				space = (height - contentH)/2;
			$content.css({
				'padding-top' : space,
				'padding-bottom' : space
			});
		},
		resetCol : function(el) {
			el.css({
				'height' : ''
			});
			el.removeClass('eut-reset-padding');
			el.find('.eut-middle-wrapper').css({
				'padding-top' : '',
				'padding-bottom' : ''
			});
		},
		limit : function( section ){
			var screenSize = section.data('tablet-portrait-equal-columns') != undefined ? mobileScreen : tabletPortrait,
				windowWidth = $(window).width() + scrollBarWidth,
				limit = true;
			if( ( windowWidth <= tabletLandscape && section.find('.eut-tablet-column-1').length ) || windowWidth <= screenSize ) {
				limit = false;
			}
			return limit;
		},
		onEnd : function( el ){
			el.css({
				'visibility' : 'visible'
			});
		}
	};

	// # Video Resize
	// ============================================================================= //
	EUTHEM.videoResize = {
		init: function( $selector ){
			setTimeout(function(){
				EUTHEM.videoResize.videoSettings( $selector );
			},100);

			$(window).resize(function(){
				setTimeout(function(){
					EUTHEM.videoResize.videoSettings( $selector );
				},1000);
			});
		},
		videoSettings: function( $selector ){
			var $video          = $selector.find('video'),
				containerWidth  = $selector.parent().outerWidth(),
				containerHeight = $selector.parent().outerHeight(),
				ratio           = 16 / 9,
				videoHeight     = containerHeight,
				videoWidth      = videoHeight * ratio;

				if( videoWidth < containerWidth ) {
					videoWidth   = containerWidth;
					videoHeight  = containerWidth * ratio;
				}

			$video.width( videoWidth ).height( videoHeight );
		}
	};

	// # Set Section Size
	// ============================================================================= //
	EUTHEM.sectionSettings = {
		init: function(){

			var section       = '#eut-main-content .eut-section',
				parentSection = '#eut-content-area, #eut-post-area, #eut-portfolio-area',
				windowWidth      = $(window).width(),
				windowHeight     = $(window).height(),
				themeWidth       = $('#eut-theme-wrapper').width(),
				contentWidth     = $(parentSection).width(),
				sidebarWidth     = $('#eut-sidebar').length && ( windowWidth + scrollBarWidth > tabletPortrait ) ? $('#eut-sidebar').outerWidth() : 0,
				headerHeight     = $('#eut-header').attr('data-sticky-header') != 'none' ? $('#eut-inner-header').outerHeight() : 0,
				fieldBarHeight   = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0,
				conteinerWidth   = contentWidth + sidebarWidth,
				space            = (themeWidth - conteinerWidth)/2,
				sidebarSpace     = themeWidth - contentWidth;

			$(section).each(function(){
				var $section      = $(this),
					heightMode    = $section.attr('data-full-height'),
					sectionType   = $section.attr('data-section-type'),
					bgImageType   = $section.attr('data-image-type');

				if( $section.parent().parent().is('.eut-blog-item') ) {
					$section.css({ 'visibility': 'visible' });
					return;
				}
				if( sectionType == 'fullwidth-background' ){
					fullBg($section);
				}
				if( sectionType == 'fullwidth-element' ){
					fullElement($section);
				}
				if( bgImageType == 'animated' ){
					animatedBg($section);
				}
				if( heightMode == 'yes' ) {
					fullHeight($section);
				}

			});

			function fullBg( section ) {
				if( $('.eut-right-sidebar').length && ( windowWidth + scrollBarWidth >= tabletPortrait ) ) {
					section.css({ 'visibility': 'visible', 'padding-left':space, 'padding-right': sidebarSpace, 'margin-left': -space, 'margin-right': -sidebarSpace});
				}
				else if( $('.eut-left-sidebar').length && ( windowWidth + scrollBarWidth >= tabletPortrait ) ) {
					section.css({ 'visibility': 'visible', 'padding-left':sidebarSpace, 'padding-right': space, 'margin-left': -sidebarSpace, 'margin-right': -space});
				} else {
					section.css({ 'visibility': 'visible', 'padding-left':space, 'padding-right': space, 'margin-left': -space, 'margin-right': -space});
				}
			}

			function fullElement( section ) {
				if( $('.eut-right-sidebar').length && ( windowWidth + scrollBarWidth >= tabletPortrait ) ) {
					section.css({ 'visibility': 'visible', 'padding-left':0, 'padding-right': sidebarSpace, 'margin-left': -space, 'margin-right': -sidebarSpace});
				}
				else if( $('.eut-left-sidebar').length && ( windowWidth + scrollBarWidth >= tabletPortrait ) ) {
					section.css({ 'visibility': 'visible', 'padding-left':sidebarSpace, 'padding-right': 0, 'margin-left': -sidebarSpace, 'margin-right': -space});
				} else {
					section.css({ 'visibility': 'visible', 'padding-left':0, 'padding-right': 0, 'margin-left': -space, 'margin-right': -space});
				}
			}

			function fullHeight( section ) {
				var sectionHeight = $( section ).find('.eut-row').outerHeight(),
					space = ( windowHeight - headerHeight - fieldBarHeight - sectionHeight )/2;
				section.css({ 'visibility': 'visible',  'padding-top' : 0, 'padding-bottom' : 0});
				if(sectionHeight > (windowHeight - headerHeight)){
					section.css({ 'visibility': 'visible', 'padding-top':40, 'padding-bottom': 40});
				} else {
					section.css({ 'visibility': 'visible', 'padding-top':space, 'padding-bottom': space});
				}
			}

			function animatedBg( section ) {
				section.on('mouseenter', function() {
					section.addClass('zoom');
				});
				section.on('mouseleave', function() {
					section.removeClass('zoom');
				});
			}
		}
	};


	// # Isotope
	// ============================================================================= //
	EUTHEM.isotope = {

		init: function() {
			var $selector = $('.eut-isotope');
			$selector.each(function(){
				var $that        = $(this),
					$container   = $that.find('.eut-isotope-container'),
					$isotopItem  = $container.find('.eut-isotope-item'),
					$curCategory = $that.find('.eut-current-category'),
					layout       = $that.data('layout') !== '' ? $that.data('layout') : 'fitRows',
					dataSpinner  = $that.data('spinner');

				if( dataSpinner == 'yes' ) {
					EUTHEM.isotope.spinner( $that );
				}
				EUTHEM.isotope.isotopeInit( $container, layout, dataSpinner );

				$that.find('.eut-filter li').on('click',function(){
					var $filter  = $(this),
						selector = $filter.attr('data-filter'),
						title    = $filter.html();

					if( $curCategory.length ){
						$curCategory.find('span').html( title );
					}

					$container.isotope({
						filter: selector
					});
					$(this).addClass('selected').siblings().removeClass('selected');
				});
			});
		},
		isotopeInit: function( $container, layout, dataSpinner ){
			$container.imagesLoaded( function() {
				EUTHEM.isotope.elementSize();
				$container.isotope({
					resizable: true,
					itemSelector: '.eut-isotope-item',
					layoutMode: layout
				});
				if( dataSpinner == 'yes' ) {
					setTimeout(function() {
						EUTHEM.isotope.removeSpinner( $container );
					},2000);
				} else {
					$container.animate({'opacity': 1},600);
				}

				EUTHEM.isotope.relayout( $container );

			});
		},
		spinner: function( $element ){
			var $spinner = $('<div class="eut-loader"></div>');
			$spinner.appendTo( $element );
		},
		removeSpinner: function( $container ){
			$container.parent().find('.eut-loader').fadeOut(600,function(){
				$container.animate({'opacity': 1},600);
			});
		},
		elementSize : function(){
			var $selector = $('.eut-isotope');

			$selector.each(function(){
				var $that = $(this),
					$container = $that.find('.eut-isotope-container'),
					$element   = $that.find('.eut-isotope-item'),
					$slider    = $that.find('.eut-slider'),
					columns    = EUTHEM.isotope.defineColumns( $that ),
					gap        = 0;

				if( $that.parents('.eut-section').data('section-type') == 'fullwidth-element' && $that.hasClass('eut-with-gap') ) {
					gap = - 40;
				} else if( $that.parents('.eut-section').data('section-type') != 'fullwidth-element' && $that.hasClass('eut-with-gap') ) {
					gap = 40;
				}

				var elementW = Math.floor(( $that.outerWidth() + gap - 0.5 )) / columns;

				$element.css({ 'width': elementW });

				// Item Width * 2
				if( columns != 1 ) {
					$that.find('.eut-image-large-square').css({ 'width': elementW * 2 });
					$that.find('.eut-image-landscape').css({ 'width': elementW * 2 }).find('.eut-media').css({ 'height': elementW - Math.abs(gap) });
					$that.find('.eut-image-portrait').css({ 'width': elementW }).find('.eut-media').css({ 'height': ( elementW * 2 ) - Math.abs(gap) });
				}

				// Item Column 2
				if( columns == 2 ) {
					$that.find('.eut-image-large-square').css({ 'width': elementW * 2 });
					$that.find('.eut-image-landscape').css({ 'width': elementW  }).find('.eut-media').css({ 'height': ( elementW / 2 ) - Math.abs(gap) });
					$that.find('.eut-image-portrait').css({ 'width': elementW }).find('.eut-media').css({ 'height': ( elementW * 2 ) - Math.abs(gap) });
				}

				// Item Column 1
				if( columns == 1 ) {
					$that.find('.eut-image-large-square').css({ 'width': elementW });
					$that.find('.eut-image-landscape').css({ 'width': elementW  }).find('.eut-media').css({ 'height': ( elementW / 2 ) - Math.abs(gap) });
					$that.find('.eut-image-portrait').css({ 'width': elementW }).find('.eut-media').css({ 'height': elementW - Math.abs(gap) });
				}

				// Init Slider Again
				$slider.each(function(){
					var $that     = $(this),
						owlSlider = $that.data('owlCarousel');
					owlSlider.reinit();
				});

				setTimeout( function(){
					EUTHEM.isotope.relayout( $container );

					// Fix Columns Height
					if( $container.parents('.eut-section').hasClass('eut-flex-row') ){
						EUTHEM.setColumnHeight.init();
					}

				}, 1000 );
			});

		},
		defineColumns : function( element ){
			var windowWidth = $(window).width() + scrollBarWidth,
				$element    = element,
				columns     = {
					desktop  : $element.data('columns'),
					tabletL   : $element.data('columns-tablet-landscape'),
					tabletP   : $element.data('columns-tablet-portrait'),
					mobille  : $element.data('columns-mobile')
				};

			if ( windowWidth > tabletLandscape ) {
				columns = columns.desktop;
			} else if ( windowWidth > tabletPortrait && windowWidth < tabletLandscape ) {
				columns = columns.tabletL;
			} else if ( windowWidth > mobileScreen && windowWidth < tabletPortrait ) {
				columns = columns.tabletP;
			} else {
				columns = columns.mobille;
			}
			return columns;
		},
		relayout: function( $container ){
			$container.isotope('layout');
		},
		noIsoFilters: function() {
			var $selector = $('.eut-non-isotope');
			$selector.each(function(){
				var $that = $(this);
				$that.find('.eut-filter li').on('click',function(){
					var selector = $(this).attr('data-filter');
					if ( '*' == selector ) {
						$that.find('.eut-non-isotope-item').fadeIn('1000');
					} else {
						$that.find('.eut-non-isotope-item').hide();
						$that.find(selector).fadeIn('1000');
					}
					$(this).addClass('selected').siblings().removeClass('selected');
				});
			});
		}
	};

	// # Footer Settings
	// ============================================================================= //
	EUTHEM.footerSettings = {
		init: function(){
			this.footerSize( '#eut-footer .eut-section' );
			this.fixedFooter();
		},
		footerSize: function(section) {
			$( section ).each(function(){
				var $that = $(this),
					sectionType = $that.attr('data-section-type');
				if( sectionType == 'fullwidth-background' ){
					footerFullBg($that);
				}
				if( sectionType == 'fullwidth-element' ){
					footerFullElement($that);
				}
			});

			function footerFullBg(element){
				var themeWidth     = $('#eut-theme-wrapper').width(),
					contentWidth   = element.parent().width(),
					space          = (themeWidth - contentWidth)/2;
				element.css({ 'visibility': 'visible', 'padding-left':space, 'padding-right': space, 'margin-left': -space, 'margin-right': -space});
			}

			function footerFullElement(element){
				var themeWidth    = $('#eut-theme-wrapper').width(),
					contentWidth  = element.parent().width(),
					space         = (themeWidth - contentWidth)/2;
				element.css({ 'visibility': 'visible', 'padding-left':0, 'padding-right': 0, 'margin-left': -space, 'margin-right': -space});
			}

		},
		fixedFooter: function(){
			var $footer      = $('#eut-footer'),
				sticky       = $footer.data('sticky-footer'),
				windowHeight = $(window).height(),
				footerHeight = $footer.outerHeight();

			if( sticky != 'yes' || isMobile.any() ) return;

			if( footerHeight > windowHeight ) {
				$('#eut-footer').removeClass('eut-sticky-footer').prev().css('margin-bottom',0);
			} else {
				$('#eut-footer').addClass('eut-sticky-footer').prev().css('margin-bottom',footerHeight);
			}
		}
	};

	// # Page Basic
	// ============================================================================= //
	EUTHEM.pageBasic = {
		init: function(){

			this.bodyLoader();
			this.gotoFirstSection();
			this.removeVideoBg();
			this.bgLoader();
			this.imageLoader();
			this.fitVid();
			this.anchorBar();
			this.searchModal();
			this.onePageSettings();
			this.hovers();
			this.stickySidebar();
			this.backtoTop();
			this.lightBox();
			this.socialShareLinks();

		},
		bodyLoader: function(){
			var $body     = $('body'),
				$overflow = $('#eut-loader-overflow'),
				$loader   = $('#eut-loader');

			$body.imagesLoaded(function(){
				$loader.fadeOut();
				$overflow.delay(200).fadeOut(700,function(){
					EUTHEM.basicElements.animAppear();
				});
			});
		},
		gotoFirstSection: function(){
			var $selector       = $('#eut-feature-section .eut-goto-section'),
				$nextSection    = $('#eut-main-content .eut-section').first().length ? $('#eut-main-content .eut-section').first() : $('#eut-main-content'),
				headerHeight    = 0,
				fieldBarHeight  = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0;

			if( $('#eut-header').data('sticky-header') == 'simply' || $('#eut-header').data('sticky-header') == 'advanced' ) {
				headerHeight = $('#eut-header-wrapper').height() -1;
			} else if( $('#eut-header').data('sticky-header') == 'shrink' ){
				headerHeight = $('#eut-header-wrapper').height() / 2;
			} else {
				headerHeight = 0;
			}

			if( $nextSection.length ) {
				$selector.on('click',function(){
					$('html,body').animate({
						scrollTop: $nextSection.offset().top - headerHeight - fieldBarHeight
					}, 1000);
					return false;
				});
			}
		},
		bgLoader: function() {
			$('#eut-main-content .eut-bg-image, #eut-footer .eut-bg-image').each(function () {
				function imageUrl(input) {
					return input.replace(/"/g,"").replace(/url\(|\)$/ig, "");
				}
				var image = new Image(),
					$that = $(this);
				image.src = imageUrl($that.css('background-image'));
				image.onload = function () {
					$that.addClass('show');
				};
			});
		},
		imageLoader: function(){
			var selectors  = {
				singleImage  : '.eut-image',
				media        : '.eut-media'
			};
			$.each(selectors, function(key, value){
				if( $(this).length ){
					var item     = $(this),
						imgLoad  = imagesLoaded( item );
					imgLoad.on( 'always', function() {
						if( $(value).parent().is('#eut-single-media') ){
							$(value).find('img').animate({ 'opacity': 1 },1000);
						} else {
							$(value).find('img').css('opacity', 1);
						}
					});
				}
			});
		},
		removeVideoBg: function(){
			var videoBg = $('.eut-bg-video');
			if( isMobile.any() ) {
				videoBg.parent().find('.eut-bg-image').css('opacity',1);
				videoBg.remove();
			} else {
				$('.eut-bg-wrapper').each(function () {
					var bgImage = $(this).find('.eut-bg-image');
					var bgVideo = $(this).find('.eut-bg-video');
					if ( bgVideo.length ) {
						var videoElement = $(this).find('.eut-bg-video video');
						var canPlayVideo = false;
						$(this).find('.eut-bg-video source').each(function(){
							if ( videoElement.get(0).canPlayType( $(this).attr('type') ) ) {
								canPlayVideo = true;
							}
						});
						if(canPlayVideo) {
							bgImage.remove();
							// Resize Video
							EUTHEM.videoResize.init( $(this) );
						} else {
							bgVideo.remove();
							bgImage.css('opacity',1);
						}
					}
				});
			}
		},
		fitVid: function(){
			$('.eut-video, .eut-media').fitVids();
			$('iframe[src*="youtube"]').parent().fitVids();
			$('iframe[src*="vimeo"]').parent().fitVids();
		},
		anchorBar: function(){
			var $anchor = $('#eut-anchor-menu');
			if( !$anchor.length ) return;

			var $btn  = $anchor.find('.eut-menu-button'),
				$menu = $anchor.find(' > ul');
			$btn.on('click',function(){
				$menu.slideToggle(300);
			});
		},
		anchorSticky: function(){
			var $anchor        = $('#eut-anchor-menu');
			if( !$anchor.length ) return;

			var $anchorWrapper = $('#eut-anchor-menu-wrapper'),
				headerHeight   = $('#eut-header').data('sticky-header') != 'none' ? $('#eut-inner-header').height() : 0,
				anchorTop      = $anchorWrapper.offset().top,
				offset         = anchorTop - headerHeight,
				scroll         = $(window).scrollTop();
			if( !$anchor.length ) return;

			if ( scroll >= offset ) {
				$anchor.addClass('eut-sticky').css({ 'top' : headerHeight });
			} else {
				$anchor.removeClass('eut-sticky').css({ 'top' : '' });
			}
		},
		searchModal: function(){
			var $btn           = $('.eut-toggle-search-modal'),
				$bodyOverlay   = $('<div id="eut-search-overlay" class="eut-body-overlay"></div>'),
				$searchContent = $('#eut-search-modal');

			// Append Overlay on body
			$bodyOverlay.appendTo('#eut-theme-wrapper');

			$btn.on('click',function(e){
				e.preventDefault();
				openSearchModal();
			});

			$('.eut-search-placeholder').on('click',function(){
				$searchContent.find('.eut-search-placeholder').addClass('hide');
				$searchContent.find('.eut-search-textfield').show().focus();
			});

			$('.eut-close-search').on('click',function(){
				closeSearchModal();
			});

			// Open Search Modal
			function openSearchModal() {
				$bodyOverlay.fadeIn(function(){
					$searchContent.fadeIn();
				});
			}

			// Close Search Modal
			function closeSearchModal() {
				$searchContent.fadeOut(function(){
					$bodyOverlay.fadeOut();
					$searchContent.find('.eut-search-placeholder').removeClass('hide');
					$searchContent.find('.eut-search-textfield').hide();
				});
			}
		},
		shrinkHeaderHeight : function(){
			var headerHeight = 0,
				stickyType   = $('#eut-header').data('sticky-header'),
				deviceSticky = $('#eut-header').data('device-sticky-header');

			if( stickyType != 'none' && $(window).width() + scrollBarWidth > tabletPortrait && $('#eut-header').length ){
				if( stickyType == 'simply' || stickyType == 'advanced' ) {
					headerHeight = $('#eut-inner-header').outerHeight();
				}
				if( stickyType == 'shrink' ) {
					headerHeight = $('#eut-header-wrapper').outerHeight() / 2;
				}
			} else if( deviceSticky == 'yes' && $(window).width() + scrollBarWidth < tabletPortrait && $('#eut-header').length ){
				headerHeight = $('#eut-inner-header').outerHeight();
			}
			return headerHeight;
		},
		onePageSettings: function(){
			var headerHeight   = EUTHEM.pageBasic.shrinkHeaderHeight(),
				stickyType     = $('#eut-header').data('sticky-header'),
				fieldBarHeight = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0;

			$('a[href*="#"]:not( [href="#"] )').on('click',function(e){
				var target = $(this.hash);
				if ( target.length && ( target.hasClass('eut-section') || target.hasClass('eut-bookmark') ) ) {
					$('html,body').animate({
						scrollTop: target.offset().top - headerHeight - fieldBarHeight + 1
					}, 1000);
					return false;
				}
			});
		},
		onePageMenu: function(){
			var $section = $('#eut-main-content .eut-section[id]');
			if (!$section.length ) return;

			var headerHeight   = EUTHEM.pageBasic.shrinkHeaderHeight(),
				fieldBarHeight = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0,
				offsetTop      = headerHeight + fieldBarHeight + wpBarHeight,
				scroll         = $(window).scrollTop();

			$section.each(function(){
				var $that         = $(this),
					currentId     = $that.attr('id'),
					sectionOffset = $that.offset().top - offsetTop;

				if (sectionOffset <= scroll && sectionOffset + $that.outerHeight() > scroll ) {
					$('a[href*="#' + currentId + '"]').parent().addClass('active');
				}
				else{
					$('a[href*="#' + currentId + '"]').parent().removeClass("active");
				}

			});
		},
		hovers: function(){
			var $hoverItem = $('.eut-image-hover');
			if ( !isMobile.any() ) {
				$hoverItem.off('click');
				$hoverItem.off('mouseenter mouseleave').on('mouseenter mouseleave', function() {
					$(this).toggleClass('hover');
				});
			} else {
				$hoverItem.on('touchend', function(e) {
					var $item = $(this);
					if ( $item.hasClass('hover') ) {
						return true;
					} else {
						$item.addClass('hover');
						$hoverItem.not(this).removeClass('hover');
						e.preventDefault();
						return false;
					}
				});
				$(document).on('touchstart touchend', function(e) {
					if ( !$hoverItem.is(e.target) && $hoverItem.has(e.target).length === 0 ) {
						$hoverItem.removeClass('hover');
					}
				});
			}
		},
		stickySidebar: function(){
			var $item    = $('#eut-sidebar.eut-fixed-sidebar');

			if( !$item.length ) {
				return;
			}
			var itemId          = $item.attr('id'),
				itemWidth       = $item.outerWidth() - 1,
				itemFloat       = 'left';

			if( $('#eut-main-content .eut-right-sidebar').length ) {
				itemFloat = 'right';
			}

			if( !$item.length || isMobile.any() ) {
				return false;
			}
			// Create A Helper Wrapper
			$item.wrap('<div id="' + itemId + '-wrapper"></div>' );
			$item.parent().css({
				'width'    : itemWidth,
				'float'    : itemFloat,
				'position' : 'relative'
			});
			$item.css({
				'width'    : itemWidth,
				'position' : 'static'
			});
		},
		stickySidebarScroll: function(){
			var $content        = $('#eut-content-area'),
				$item           = $('#eut-sidebar.eut-fixed-sidebar');

				if( !$item.length ) {
					return;
				}

			var itemHeight      = $item.outerHeight(),
				headerHeight    = $('#eut-header').data('sticky-header') != 'none' ? $('#eut-inner-header').outerHeight() : 0,
				fieldBarHeight  = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0,
				offset          = headerHeight + fieldBarHeight + 30,
				windowHeight    = $(window).height(),
				contentHeight   = $content.outerHeight(),
				contentTop      = $content.offset().top,
				contentBottom   = contentTop + contentHeight;

			if( !$item.length || itemHeight > windowHeight || isMobile.any() ) {
				return false;
			}

			if( ( $(window).scrollTop() > contentTop - offset ) && ( $(window).scrollTop() < contentBottom - ( offset + itemHeight ) )){
				$item.css({'position':'fixed', 'top': offset });
			}
			else if( $(window).scrollTop() > contentTop ){
				$item.css({'position':'absolute', 'top': contentHeight - itemHeight });
			}
			else if( $(window).scrollTop() < contentTop ){
				$item.css({'position':'static', 'top':'auto' });
			}
		},
		backtoTop: function() {
			var selectors  = {
				topBtn     : '.eut-top-btn',
				dividerBtn : '.eut-divider-backtotop',
				topLink    : 'a[href="#eut-goto-header"]'
			};
			// Show backtoTop Button
			if( $('#eut-header').attr('data-backtotop') != 'no' ) {
				var btnUp = $('<div/>', {'class':'eut-top-btn fa fa-angle-up'});
					btnUp.appendTo('#eut-theme-wrapper');

				$(window).on('scroll', function() {
					if ($(this).scrollTop() > 600) {
						$('.eut-top-btn').addClass('show');
						$('.eut-side-area-button').addClass('push');
					} else {
						$('.eut-top-btn').removeClass('show');
						$('.eut-side-area-button').removeClass('push');
					}
				});
			}
			$.each(selectors, function(key, value){
				$(value).on('click', function(){
					$('html, body').animate({scrollTop: 0}, 900);
				});
			});

		},
		showSideAreaBtn: function(){
			var $btn         = $('.eut-side-area-button'),
				$featureArea = $('#eut-feature-section'),
				fullscreen   = $('#eut-header').data('fullscreen'),
				scroll       = $(window).scrollTop(),
				windowHeight = $(window).height();

			if( $btn.length ) {
				if( $featureArea.length && fullscreen === 'yes' && sideAreaBtnAppear === false ){
					if( scroll > windowHeight/3 ) {
						$btn.addClass('show');
					} else {
						$btn.removeClass('show');
					}
				} else {
					$btn.addClass('show');
				}
			}
		},
		lightBox: function(){
			//IMAGE
			$('.eut-image-popup').each(function() {
				$(this).magnificPopup({
					type: 'image',
					preloader: false,
					fixedBgPos: true,
					fixedContentPos: true,
					removalDelay: 200,
					callbacks: {
						beforeOpen: function() {
							var mfpWrap = this.wrap;
							this.bgOverlay.fadeIn(200);
							addSpinner( mfpWrap );
						},
						imageLoadComplete: function() {
							var $spinner = this.wrap.find('.eut-loader'),
								$content = this.container;
							removeSpinner( $spinner, $content );

						},
						beforeClose: function() {
							this.wrap.fadeOut(100);
							this.bgOverlay.fadeOut(100);
						},
					},
					image: {
						verticalFit: true,
						titleSrc: function(item) {
							var title   = item.el.data( 'title' ) ? item.el.data( 'title' ) : '',
								caption = item.el.data('desc') ? '<br><small>' + item.el.data('desc') + '</small>' : '';
							if ( '' === title ) {
								title   = item.el.find('.eut-title').html() ? item.el.find('.eut-title').html() : '';
							}
							if ( '' === caption ) {
								caption = item.el.find('.eut-caption').html() ? '<br><small>' + item.el.find('.eut-caption').html() + '</small>' : '';
							}
							return title + caption;
						}
					}
				});
			});
			$('.eut-gallery-popup, .eut-post-gallery-popup').each(function() {
				$(this).magnificPopup({
					delegate: 'a',
					type: 'image',
					preloader: false,
					fixedBgPos: true,
					fixedContentPos: true,
					removalDelay: 200,
					callbacks: {
						beforeOpen: function() {
							var mfpWrap = this.wrap;
							this.bgOverlay.fadeIn(200);
							addSpinner( mfpWrap );
						},
						imageLoadComplete: function() {
							var $spinner = this.wrap.find('.eut-loader'),
								$content = this.container;
							removeSpinner( $spinner, $content );

						},
						beforeClose: function() {
							this.wrap.fadeOut(100);
							this.bgOverlay.fadeOut(100);
						},
					},
					gallery: {
						enabled:true
					},
					image: {
						tError: '<a href="%url%">The image #%curr%</a> could not be loaded.',
						titleSrc: function(item) {
							var title   = item.el.data( 'title' ) ? item.el.data( 'title' ) : '',
								caption = item.el.data('desc') ? '<br><small>' + item.el.data('desc') + '</small>' : '';
							if ( '' === title ) {
								title   = item.el.find('.eut-title').html() ? item.el.find('.eut-title').html() : '';
							}
							if ( '' === caption ) {
								caption = item.el.find('.eut-caption').html() ? '<br><small>' + item.el.find('.eut-caption').html() + '</small>' : '';
							}
							return title + caption;
						}
					}
				});
			});

			if( 1 == eut_main_data.eut_wp_gallery_popup ) {
				$('.gallery').each(function() {
					$(this).magnificPopup({
						delegate: 'a',
						type: 'image',
						preloader: false,
						fixedBgPos: true,
						fixedContentPos: true,
						removalDelay: 200,
						callbacks: {
							beforeOpen: function() {
								var mfpWrap = this.wrap;
								this.bgOverlay.fadeIn(200);
								addSpinner( mfpWrap );
							},
							imageLoadComplete: function() {
								var $spinner = this.wrap.find('.eut-loader'),
									$content = this.container;
								removeSpinner( $spinner, $content );

							},
							beforeClose: function() {
								this.wrap.fadeOut(100);
								this.bgOverlay.fadeOut(100);
							},
						},
						gallery: {
							enabled:true
						},
						image: {
							tError: '<a href="%url%">The image #%curr%</a> could not be loaded.',
							titleSrc: function(item) {
								var title   = item.el.closest('.gallery-item').find('.gallery-caption').html() ? item.el.closest('.gallery-item').find('.gallery-caption').html() : '';
								return title;
							}
						}
					});
				});
			}
			//VIDEOS
			if ( $('#eut-body').hasClass( 'eut-privacy-video-embeds-disabled' ) ) {
				$('.eut-youtube-popup, .eut-vimeo-popup, .eut-video-popup').each(function() {
					$(this).attr({"target" : "_blank"});
				});
			} else {
				$('.eut-youtube-popup, .eut-vimeo-popup, .eut-video-popup').each(function() {
					$(this).magnificPopup({
						disableOn: 0,
						type: 'iframe',
						preloader: false,
						fixedBgPos: true,
						fixedContentPos: true,
						removalDelay: 200,
						callbacks: {
							beforeOpen: function() {
								var mfpWrap = this.wrap;
								this.bgOverlay.fadeIn(200);
								addSpinner( mfpWrap );
							},
							open: function() {
								var $spinner = this.wrap.find('.eut-loader'),
									$content = this.container;
								removeSpinner( $spinner, $content );
							},
							beforeClose: function() {
								this.wrap.fadeOut(100);
								this.bgOverlay.fadeOut(100);
							},
						}
					});
				});
			}
			$('.eut-page-popup').each(function() {
				$(this).magnificPopup({
					disableOn: 0,
					type: 'iframe',
					preloader: false,
					fixedBgPos: true,
					fixedContentPos: true,
					removalDelay: 200,
					callbacks: {
						beforeOpen: function() {
							var mfpWrap = this.wrap;
							this.bgOverlay.fadeIn(200);
							addSpinner( mfpWrap );
						},
						open: function() {
							var $spinner = this.wrap.find('.eut-loader'),
								$content = this.container;
							removeSpinner( $spinner, $content );
						},
						beforeClose: function() {
							this.wrap.fadeOut(100);
							this.bgOverlay.fadeOut(100);
						},
					}
				});
			});

			function addSpinner( mfpWrap ){
				var spinner = '<div class="eut-loader"></div>';
				$(spinner).appendTo( mfpWrap );
			}

			function removeSpinner( spinner, content ){
				setTimeout(function(){
					spinner.fadeOut(1000, function(){
						content.animate({'opacity':1},600);
					});
				}, 700);
			}
		},
		socialShareLinks: function(){
			$('.eut-social-share-facebook').on('click',function(e){
				e.preventDefault();
				window.open( 'https://www.facebook.com/sharer/sharer.php?u=' + $(this).attr('href'), "facebookWindow", "height=380,width=660,resizable=0,toolbar=0,menubar=0,status=0,location=0,scrollbars=0" );
				return false;
			});
			$('.eut-social-share-twitter').on('click',function(e){
				e.preventDefault();
				window.open( 'http://twitter.com/intent/tweet?text=' + encodeURIComponent( $(this).attr('title') ) + ' ' + $(this).attr('href'), "twitterWindow", "height=450,width=660,resizable=0,toolbar=0,menubar=0,status=0,location=0,scrollbars=0" );
				return false;
			});
			$('.eut-social-share-linkedin').on('click',function(e){
				e.preventDefault();
				window.open( 'http://www.linkedin.com/shareArticle?mini=true&url=' + $(this).attr('href') + '&title=' + encodeURIComponent( $(this).attr('title') ), "linkedinWindow", "height=500,width=820,resizable=0,toolbar=0,menubar=0,status=0,location=0,scrollbars=0" );
				return false;
			});
			$('.eut-social-share-pinterest').on('click',function(e){
				e.preventDefault();
				window.open( 'http://pinterest.com/pin/create/button/?url=' + $(this).attr('href') + '&media=' + $(this).data('pin-img') + '&description=' + encodeURIComponent( $(this).attr('title') ), "pinterestWindow", "height=600,width=600,resizable=0,toolbar=0,menubar=0,status=0,location=0,scrollbars=0" );
				return false;
			});
			$('.eut-social-share-reddit').on('click',function(e){
				e.preventDefault();
				window.open( '//www.reddit.com/submit?url=' + $(this).attr('href'), "redditWindow", "height=600,width=820,resizable=0,toolbar=0,menubar=0,status=0,location=0,scrollbars=0" );
				return false;
			});
			$('.eut-like-counter-link').on('click',function(e){
				e.preventDefault();
				var link = $(this);
				var id = link.data('post-id'),
					counter = link.parent().find('.eut-like-counter');
				var dataParams = {
					action:'corpus_eutf_likes_callback',
					eut_likes_id: id,
					_eutf_nonce: eut_main_data.nonce_likes
				};
				$.post( eut_main_data.ajaxurl, dataParams , function( response ) {
					counter.html(response);
				}).fail(function(xhr, status, error) {
				});
				return false;
			});
		}
	};

	// # Basic Elements
	// ============================================================================= //
	EUTHEM.basicElements = {
		init: function(){
			this.pieChart();
			this.progressBars();
			this.counter();
			this.slider();
			this.carousel();
			this.testimonial();
			this.accordionToggle();
			this.tabs();
			this.vcAccordion();
			this.vcTab();
			this.infoBox();
			this.expandableInfo();
			if( !$('#eut-loader-overflow').length ) {
				this.animAppear();
			}
		},
		pieChart: function(){

			$('.eut-chart-number').each(function() {
				var $element = $(this),
					delay       = $element.parent().attr('data-delay') !== '' ? parseInt( $element.parent().attr('data-delay') ) : 0,
					chartSize   = '170';

				$element.css({ 'width' : chartSize, 'height' : chartSize, 'line-height' : chartSize + 'px' });

				$element.appear(function() {
					setTimeout(function () {
						EUTHEM.basicElements.pieChartInit( $element );
					}, delay);
				});
			});

		},
		pieChartInit: function( $element ){

			var activeColor = $element.data('pie-active-color') !== '' ? $element.data('pie-active-color') : 'rgba(0,0,0,1)',
				pieColor    = $element.data('pie-color') !== '' ? $element.data('pie-color') : 'rgba(0,0,0,0.1)',
				pieLineCap  = $element.data('pie-line-cap') !== '' ? $element.data('pie-line-cap') : 'round',
				lineSize    = $element.data('pie-line-size') !== '' ? $element.data('pie-line-size') : '6',
				chartSize   = '170';


			$element.easyPieChart({
				barColor: activeColor,
				trackColor: pieColor,
				scaleColor: false,
				lineCap: pieLineCap,
				lineWidth: lineSize,
				animate: 1500,
				size: chartSize
			});
		},
		progressBars: function(){
			var selector = '.eut-progress-bar';
			$(selector).each(function() {
				$(this).appear(function() {

					var val         = $(this).attr('data-value'),
						percentage  = $('<span class="eut-percentage">'+ val + '%'+'</span>');

					$(this).find('.eut-bar-line').animate({ width: val + '%' }, 1600);
					if( $(this).parent().hasClass('eut-style-1') ) {
						percentage.appendTo($(this).find('.eut-bar')).animate({ left: val + '%' }, 1600);
					} else {
						percentage.appendTo($(this).find('.eut-bar-title'));
					}

				});
			});
		},
		counter: function(){
			var selector = '.eut-counter-item span';
			$(selector).each(function(i){
				var elements = $(selector)[i],
					thousandsSeparator = $(this).attr('data-thousands-separator') !== '' ? $(this).attr('data-thousands-separator') : ',';
				$(elements).attr('id','eut-counter-' + i );
				var delay = $(this).parents('.eut-counter').attr('data-delay') !== '' ? parseInt( $(this).parents('.eut-counter').attr('data-delay') ) : 200,
					options = {
						useEasing    : true,
						useGrouping  : true,
						separator    : $(this).attr('data-thousands-separator-vis') !== 'yes' ? thousandsSeparator : '',
						decimal      : $(this).attr('data-decimal-separator') !== '' ? $(this).attr('data-decimal-separator') : '.',
						prefix       : $(this).attr('data-prefix') !== '' ? $(this).attr('data-prefix') : '',
						suffix       : $(this).attr('data-suffix') !== '' ? $(this).attr('data-suffix') : ''
					},
					counter = new countUp( $(this).attr('id') , $(this).attr('data-start-val'), $(this).attr('data-end-val'), $(this).attr('data-decimal-points'), 2.5, options);
				$(this).appear(function() {
					setTimeout(function () {
						counter.start();
					}, delay);
				});
			});
		},
		slider: function( settings ){

			var $element  = $('.eut-slider:not(#eut-feature-slider)');

				$element.each(function(){
					var $that = $(this),
						carouselSettings = {
							sliderSpeed     : ( parseInt( $that.attr('data-slider-speed') ) ) ? parseInt( $that.attr('data-slider-speed') ) : 3000,
							paginationSpeed : ( parseInt( $that.attr('data-pagination-speed') ) ) ? parseInt( $that.attr('data-pagination-speed') ) : 400,
							autoHeight      : $that.attr('data-slider-autoheight') == 'yes' ? true : false,
							sliderPause     : $that.attr('data-slider-pause') == 'yes' ? true : false,
							autoPlay        : $that.attr('data-slider-autoplay') != 'no' ? true : false,
							baseClass       : 'eut-carousel',
							pagination      : $that.parents('.eut-element').hasClass('eut-isotope') ? true : false,
						};

					carouselInit( $that, carouselSettings );
					customNav( $that );
				});

			// Init Slider
			function carouselInit( $element, settings ){
				$element.owlCarousel({
					navigation      : false,
					pagination      : settings.pagination,
					autoHeight      : settings.autoHeight,
					slideSpeed      : settings.paginationSpeed,
					paginationSpeed : settings.paginationSpeed,
					singleItem      : true,
					autoPlay        : settings.autoPlay,
					stopOnHover     : settings.sliderPause,
					baseClass       : 'owl-carousel',
					theme           : 'eut-theme'
				});
				// Carousel Element Speed
				if( settings.autoPlay === true ){
					$element.trigger( 'owl.play', settings.sliderSpeed );
				}
			}

			// Slider Navigation
			function customNav( $element ){
				$element.parent().find('.eut-carousel-next').on('click',function(){
					$element.trigger('owl.next');
				});
				$element.parent().find('.eut-carousel-prev').on('click',function(){
					$element.trigger('owl.prev');
				});
			}

		},
		carousel: function(){

			var $carousel = $('.eut-carousel');

			$carousel.each(function(){
				var $that = $(this),
					carouselSettings = {
						sliderSpeed : ( parseInt( $that.attr('data-slider-speed') ) ) ? parseInt( $that.attr('data-slider-speed') ) : 3000,
						paginationSpeed : ( parseInt( $that.attr('data-pagination-speed') ) ) ? parseInt( $that.attr('data-pagination-speed') ) : 400,
						autoHeight  : $that.attr('data-slider-autoheight') == 'yes' ? true : '',
						sliderPause : $that.attr('data-slider-pause') == 'yes' ? true : false,
						autoPlay    : $that.attr('data-slider-autoplay') != 'no' ? true : false,
						itemNum     : parseInt( $that.attr('data-items')),
						itemsTablet : [768,2],
						baseClass   : 'eut-carousel'
					};

				carouselInit( $that, carouselSettings );
				customNav( $that );

			});
			// Init Carousel
			function carouselInit( $element, settings ){
				$element.owlCarousel({
					navigation        : false,
					pagination        : false,
					autoHeight        : settings.autoHeight,
					slideSpeed        : 400,
					paginationSpeed   : settings.paginationSpeed,
					singleItem        : false,
					items             : settings.itemNum,
					autoPlay          : settings.autoPlay,
					stopOnHover       : settings.sliderPause,
					baseClass         : 'eut-carousel-element',
					theme             : '',
					itemsDesktop      : false,
					itemsDesktopSmall : false,
				 	itemsTablet       : settings.itemsTablet
				});

				// Carousel Element Speed
				if( settings.autoPlay === true ){
					$element.trigger('owl.play',settings.sliderSpeed);
				}
				$element.css('visibility','visible');
			}

			// Carousel Navigation
			function customNav( $element ){
				$element.parent().find('.eut-carousel-next').on('click',function(){
					$element.trigger('owl.next');
				});
				$element.parent().find('.eut-carousel-prev').on('click',function(){
					$element.trigger('owl.prev');
				});
			}
		},
		testimonial: function(){

			var $testimonial = $('.eut-testimonial');

			$testimonial.each(function(){
				var $that = $(this),
					carouselSettings = {
						sliderSpeed : ( parseInt( $that.attr('data-slider-speed') ) ) ? parseInt( $that.attr('data-slider-speed') ) : 3000,
						paginationSpeed : ( parseInt( $that.attr('data-pagination-speed') ) ) ? parseInt( $that.attr('data-pagination-speed') ) : 400,
						autoHeight  : $that.attr('data-slider-autoheight') == 'yes' ? true : '',
						sliderPause : $that.attr('data-slider-pause') == 'yes' ? true : false,
						autoPlay    : $that.attr('data-slider-autoplay') != 'no' ? true : false,
						itemNum     : parseInt( $that.attr('data-items')),
						baseClass   : 'eut-testimonial'
					};

				carouselInit( $that, carouselSettings );

			});
			// Init Carousel
			function carouselInit( $element, settings ){
				$element.owlCarousel({
					navigation        : false,
					pagination        : true,
					autoHeight        : settings.autoHeight,
					slideSpeed        : 400,
					paginationSpeed   : settings.paginationSpeed,
					singleItem        : true,
					autoPlay          : settings.autoPlay,
					stopOnHover       : settings.sliderPause,
					baseClass         : 'eut-testimonial-element',
					theme             : '',
				});

				// Carousel Element Speed
				if( settings.autoPlay === true ){
					$element.trigger('owl.play',settings.sliderSpeed);
				}
			}
		},
		iconBox: function(){
			var $parent   = $('.eut-row'),
				arrHeight = [];

			$parent.each(function(){
				var $iconBox  = $(this).find('.eut-box-icon.eut-advanced-hover');
				if( !$iconBox.length ) return;

				if( isMobile.any() ) {
					$iconBox.removeClass('eut-advanced-hover');
					return;
				}

				$iconBox.css({ 'height' : '', 'padding-top' : '' });
				$iconBox.each(function(){
					var $that          = $(this),
						$iconBoxHeigth = $that.height();

					arrHeight.push( $iconBoxHeigth );
				});

				var maxHeight   = Math.max.apply(Math,arrHeight) + 20,
					iconHeight  = $iconBox.find('.eut-wrapper-icon').height(),
					paddingTop  = ( maxHeight - iconHeight )/2;

				$iconBox.css({ 'height' : maxHeight, 'padding-top' : paddingTop });
				setTimeout(function() {
					$iconBox.addClass('active');
				}, 300);

				$iconBox.off('mouseenter mouseleave').on('mouseenter mouseleave', function() {
					$(this).toggleClass('hover');
				});

			});
		},
		accordionToggle: function(){
			$('.eut-toggle-wrapper.eut-first-open').each(function(){
				$(this).find('li').first().addClass('active');
			});
			$('.eut-toggle-wrapper li.active').find('.eut-title').addClass('active');
			$('.eut-toggle-wrapper li .eut-title').on('click',function(){
				$(this)
					.toggleClass('active')
					.next().slideToggle(350);
			});
			$('.eut-accordion-wrapper.eut-first-open').each(function(){
				$(this).find('li').first().addClass('active');
			});
			$('.eut-accordion-wrapper li.active').find('.eut-title').addClass('active');
			$('.eut-accordion-wrapper li .eut-title').on('click',function(){
				$(this)
					.toggleClass('active').next().slideToggle(350)
					.parent().siblings().find('.eut-title').removeClass('active')
					.next().slideUp(350);
			});
		},
		tabs: function(){
			$('.eut-tabs-title li').on('click',function(){
				$(this).addClass('active').siblings().removeClass('active');
				$(this).parent().parent().find('.eut-tabs-wrapper').find('.eut-tab-content').eq($(this).index()).addClass('active').siblings().removeClass('active');
			});
			$('.eut-tabs-title').each(function(){
				$(this).find('li').first().click();
			});
		},
		vcAccordion: function(){
			var $target = $('.vc_tta-accordion').find('a[data-vc-accordion]'),
				$panel = $('.vc_tta-panel');
			if( $panel.find('.eut-isotope').length ) {
				setTimeout(function(){
					EUTHEM.isotope.init();
				},100);
			}
			$target.on('click',function(){
				if( $panel.find('.eut-isotope').length ) {
					setTimeout(function(){
						EUTHEM.isotope.init();
					},100);
				}
			});
		},
		vcTab: function(){
			var $target = $('.vc_tta-tabs').find('a[data-vc-tabs]'),
				$panel = $('.vc_tta-panel');
			if( $panel.find('.eut-isotope').length ) {
				setTimeout(function(){
					EUTHEM.isotope.init();
				},100);
			}
			$target.on('click',function(){
				if( $panel.find('.eut-isotope').length ) {
					setTimeout(function(){
						EUTHEM.isotope.init();
					},100);
				}
			});
		},
		infoBox: function(){
			var infoMessage = $('.eut-message'),
			closeBtn = infoMessage.find($('.eut-close'));
			closeBtn.on('click',function(){
				$(this).parent().slideUp(150);
			});
		},
		animAppear: function(){
			if(isMobile.any()) {
				$('.eut-animated-item').css('opacity',1);
			} else {
				$('.eut-animated-item').each(function() {
					var timeDelay = $(this).attr('data-delay');
					$(this).appear(function() {
					var $that = $(this);
						setTimeout(function () {
							$that.addClass('eut-animated');
						}, timeDelay);
					},{accX: 0, accY: -150});
				});
			}
		},
		expandableInfo: function(){
			var $item = $('.eut-expandable-info');
			$item.each(function(){
				var $that         = $(this),
					$wrapper      = $that.parents('.eut-section'),
					$content      = $that.find('.eut-expandable-info-content'),
					paddingTop    = parseInt( $wrapper.css('padding-top') ),
					paddingBottom = parseInt( $wrapper.css('padding-bottom') );

				$wrapper.addClass('eut-pointer-cursor');
				$wrapper.on('click',function(){

					var headerHeight   = $('#eut-header').data('sticky-header') != 'none' ? $('#eut-inner-header').outerHeight() : 0,
						fieldBarHeight = $('.eut-fields-bar').length ? $('.eut-fields-bar').outerHeight() : 0,
						offset         = $(this).offset().top,
						distance       = offset - ( headerHeight + fieldBarHeight );

					if( $content.is(":visible") ){
						$content.slideUp( 600, function(){
							$content.removeClass('show');
						});
					} else {

						$('html,body').animate({
							scrollTop: distance
						}, 600,function(){
							$content.slideDown( function(){
								$content.addClass('show');
								return;
							});
						});
					}
				});
				$wrapper.on('mouseenter', function() {
					$(this).css({ 'padding-top' : paddingTop + 40, 'padding-bottom' : paddingBottom + 40 });
				});
				$wrapper.on('mouseleave', function() {
					$(this).css({ 'padding-top' : paddingTop, 'padding-bottom' : paddingBottom });
				});
			});
		}
	};

	// # Main Menu
	// ============================================================================= //
	EUTHEM.mainMenu = {

		menu      : '#eut-main-menu',
		menuItem  : '#eut-main-menu li',

		init: function() {
			$(this.menuItem).on('mouseenter', function() {
				var itemHover = $(this);

				EUTHEM.mainMenu.menuPosition(itemHover);

				itemHover.find( ' > ul ' ).addClass('active');
			});
			$(this.menuItem).on('mouseleave', function() {
				var itemHover = $(this);
				itemHover.find( ' > ul ' ).removeClass('active');
			});
			$(this.menuItem).find( ' > a[href="#"]').on('click',function(e){
				e.preventDefault();
			});

			// Fix Double Click on devices without responsive menu
			if( isMobile.any() ) {
				EUTHEM.mainMenu.deviceMenu();
			}

		},
		menuPosition: function(item){
			var containerWidth  = $(this.menu).parent().outerWidth(),
				subMenu         = item.find(' > ul '),
				subMenuWidth    = subMenu.width(),
				windowWidth     = $(window).width(),
				menuPositionX   = item.offset().left;

			if ( !item.hasClass('megamenu') && (menuPositionX + subMenuWidth) > ( windowWidth - containerWidth )/2 + containerWidth) {
				subMenu.addClass('eut-position-right');
			}
		},
		deviceMenu: function(){
			var $menuItem = $(this.menuItem);
			$menuItem.on('touchstart touchend', function(e) {
				var $item = $(this);
				$item.siblings().removeClass('open-submenu').find( ' > ul ' ).removeClass('active');
				if( $item.hasClass('menu-item-has-children') && $item.find('> a').attr('href') != '#' ) {
					if( !$item.hasClass('open-submenu') ) {
						$item.find( ' > ul ' ).addClass('active');
						e.preventDefault();
						$item.addClass('open-submenu');
					}
				}
			});
		}
	};


	//////////////////////////////////////////////////////////////////////////////////////////////////////
	// GLOBAL VARIABLES
	//////////////////////////////////////////////////////////////////////////////////////////////////////
	var largeScreen = 2048;
	var tabletLandscape = 1200;
	var tabletPortrait = 1023;
	var mobileScreen = 767;

	var wpBarHeight = $('#eut-body').hasClass('admin-bar') ? 32 : 0;
	var isMobile = {
		Android: function() {
			return navigator.userAgent.match(/Android/i);
		},
		BlackBerry: function() {
			return navigator.userAgent.match(/BlackBerry/i);
		},
		iOS: function() {
			return navigator.userAgent.match(/iPhone|iPad|iPod/i);
		},
		Opera: function() {
			return navigator.userAgent.match(/Opera Mini/i);
		},
		Windows: function() {
			return navigator.userAgent.match(/IEMobile/i);
		},
		any: function() {
			return (isMobile.Android() || isMobile.BlackBerry() || isMobile.iOS() || isMobile.Opera() || isMobile.Windows());
		}
	};

	// Scrollbar Width
	var parent, child, scrollBarWidth;

	if( scrollBarWidth === undefined ) {
		parent          = $('<div style="width:50px;height:50px;overflow:auto"><div/></div>').appendTo('body');
		child           = parent.children();
		scrollBarWidth  = child.innerWidth()-child.height(99).innerWidth();
		parent.remove();
	}

	$(document).ready(function(){ EUTHEM.documentReady.init(); });
	$(window).afterResize(function(){ EUTHEM.documentResize.init(); });
	$(window).on('load',function () { EUTHEM.documentLoad.init(); });
	$(window).on('scroll', function() { EUTHEM.documentScroll.init(); });

})(jQuery);