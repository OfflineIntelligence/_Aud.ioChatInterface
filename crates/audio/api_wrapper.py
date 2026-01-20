"""
Voice API Wrapper
Provides HTTP API endpoints for voice functionality integration
"""

import json
import logging
import threading
from typing import Dict, Any, Optional
from flask import Flask, request, jsonify, Response
import time

from .voice_interface import voice_interface, VoiceConfig, VoiceMode

logger = logging.getLogger(__name__)

class VoiceAPI:
    """REST API wrapper for voice interface functionality"""
    
    def __init__(self, host: str = '127.0.0.1', port: int = 8002):
        self.host = host
        self.port = port
        self.app = Flask(__name__)
        self.server_thread = None
        self.is_running = False
        
        self._setup_routes()
    
    def _setup_routes(self):
        """Setup API routes"""
        
        @self.app.route('/health', methods=['GET'])
        def health_check():
            """Health check endpoint"""
            return jsonify({
                'status': 'healthy',
                'voice_active': voice_interface.is_active,
                'mode': voice_interface.mode.value
            })
        
        @self.app.route('/voice/start', methods=['POST'])
        def start_voice():
            """Start voice interface"""
            try:
                data = request.get_json() or {}
                
                # Update configuration if provided
                if 'config' in data:
                    config_data = data['config']
                    config = VoiceConfig(
                        enable_stt=config_data.get('enable_stt', True),
                        enable_tts=config_data.get('enable_tts', True),
                        silence_threshold=config_data.get('silence_threshold', 1.5),
                        wake_word=config_data.get('wake_word'),
                        auto_respond=config_data.get('auto_respond', True),
                        continuous_mode=config_data.get('continuous_mode', False)
                    )
                    voice_interface.config = config
                
                success = voice_interface.start()
                return jsonify({
                    'success': success,
                    'message': 'Voice interface started' if success else 'Failed to start voice interface'
                })
                
            except Exception as e:
                logger.error(f"Error starting voice: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/stop', methods=['POST'])
        def stop_voice():
            """Stop voice interface"""
            try:
                voice_interface.stop()
                return jsonify({'success': True, 'message': 'Voice interface stopped'})
            except Exception as e:
                logger.error(f"Error stopping voice: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/speak', methods=['POST'])
        def speak_text():
            """Speak text through TTS"""
            try:
                data = request.get_json()
                if not data or 'text' not in data:
                    return jsonify({'success': False, 'error': 'Missing text parameter'}), 400
                
                text = data['text']
                wait = data.get('wait', False)
                voice_preset = data.get('voice_preset', 'normal')
                
                success = voice_interface.speak(text, wait=wait, voice_preset=voice_preset)
                return jsonify({
                    'success': success,
                    'message': f'Speaking: {text}' if success else 'Failed to speak text'
                })
                
            except Exception as e:
                logger.error(f"TTS error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/status', methods=['GET'])
        def get_status():
            """Get voice interface status"""
            try:
                status = voice_interface.get_status()
                return jsonify(status)
            except Exception as e:
                logger.error(f"Status error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/config', methods=['GET', 'POST'])
        def voice_config():
            """Get or update voice configuration"""
            if request.method == 'GET':
                # Return current config
                config_dict = {
                    'enable_stt': voice_interface.config.enable_stt,
                    'enable_tts': voice_interface.config.enable_tts,
                    'silence_threshold': voice_interface.config.silence_threshold,
                    'wake_word': voice_interface.config.wake_word,
                    'auto_respond': voice_interface.config.auto_respond,
                    'continuous_mode': voice_interface.config.continuous_mode
                }
                return jsonify(config_dict)
            
            elif request.method == 'POST':
                # Update config
                try:
                    data = request.get_json()
                    if not data:
                        return jsonify({'success': False, 'error': 'No configuration data provided'}), 400
                    
                    # Update configuration
                    if 'enable_stt' in data:
                        voice_interface.config.enable_stt = bool(data['enable_stt'])
                    if 'enable_tts' in data:
                        voice_interface.config.enable_tts = bool(data['enable_tts'])
                    if 'silence_threshold' in data:
                        voice_interface.config.silence_threshold = float(data['silence_threshold'])
                    if 'wake_word' in data:
                        voice_interface.config.wake_word = data['wake_word']
                    if 'auto_respond' in data:
                        voice_interface.config.auto_respond = bool(data['auto_respond'])
                    if 'continuous_mode' in data:
                        voice_interface.config.continuous_mode = bool(data['continuous_mode'])
                    
                    return jsonify({
                        'success': True,
                        'message': 'Configuration updated',
                        'config': {
                            'enable_stt': voice_interface.config.enable_stt,
                            'enable_tts': voice_interface.config.enable_tts,
                            'silence_threshold': voice_interface.config.silence_threshold,
                            'wake_word': voice_interface.config.wake_word,
                            'auto_respond': voice_interface.config.auto_respond,
                            'continuous_mode': voice_interface.config.continuous_mode
                        }
                    })
                    
                except Exception as e:
                    logger.error(f"Config update error: {e}")
                    return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/wakeword', methods=['POST'])
        def set_wake_word():
            """Set or disable wake word"""
            try:
                data = request.get_json()
                wake_word = data.get('wake_word') if data else None
                
                voice_interface.set_wake_word(wake_word)
                
                return jsonify({
                    'success': True,
                    'message': f'Wake word {"set to " + wake_word if wake_word else "disabled"}'
                })
                
            except Exception as e:
                logger.error(f"Wake word error: {e}")
                return jsonify({'success': False, 'error': str(e)}), 500
        
        @self.app.route('/voice/events', methods=['GET'])
        def voice_events():
            """Server-Sent Events endpoint for real-time voice events"""
            def event_generator():
                # This would need a proper event system implementation
                # For now, we'll simulate periodic status updates
                while True:
                    try:
                        status = voice_interface.get_status()
                        yield f"data: {json.dumps(status)}\n\n"
                        time.sleep(1)
                    except Exception as e:
                        logger.error(f"Event stream error: {e}")
                        break
            
            return Response(event_generator(), mimetype='text/event-stream')
    
    def start(self, debug: bool = False):
        """Start the API server"""
        if self.is_running:
            logger.warning("API server already running")
            return
            
        try:
            self.server_thread = threading.Thread(
                target=lambda: self.app.run(
                    host=self.host,
                    port=self.port,
                    debug=debug,
                    use_reloader=False
                ),
                daemon=True
            )
            self.server_thread.start()
            self.is_running = True
            logger.info(f"Voice API server started on {self.host}:{self.port}")
            
        except Exception as e:
            logger.error(f"Failed to start API server: {e}")
    
    def stop(self):
        """Stop the API server"""
        if not self.is_running:
            return
            
        self.is_running = False
        logger.info("Voice API server stopped")

# Global API instance
voice_api = VoiceAPI()

def start_voice_api(host: str = '127.0.0.1', port: int = 8002, debug: bool = False):
    """Start the voice API server"""
    global voice_api
    voice_api = VoiceAPI(host, port)
    voice_api.start(debug)
    return voice_api

def stop_voice_api():
    """Stop the voice API server"""
    global voice_api
    if voice_api:
        voice_api.stop()

if __name__ == "__main__":
    # Test the API server
    logging.basicConfig(level=logging.INFO)
    
    print("Starting Voice API server...")
    print("Endpoints available:")
    print("  GET  /health          - Health check")
    print("  POST /voice/start     - Start voice interface")
    print("  POST /voice/stop      - Stop voice interface")
    print("  POST /voice/speak     - Speak text")
    print("  GET  /voice/status    - Get status")
    print("  GET  /voice/config    - Get configuration")
    print("  POST /voice/config    - Update configuration")
    print("  POST /voice/wakeword  - Set wake word")
    print("\nPress Ctrl+C to stop")
    
    try:
        start_voice_api(debug=True)
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nStopping API server...")
        stop_voice_api()