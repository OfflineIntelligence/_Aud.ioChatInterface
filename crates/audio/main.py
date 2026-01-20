"""
Main entry point for the Aud.io Voice Mode
Integrates with existing system and provides CLI interface
"""

import sys
import os
import logging
import argparse
import time
import json
from typing import Optional, Dict, Any

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from voice_interface import voice_interface, VoiceConfig
from api_wrapper import voice_api
from audio_utils import audio_manager

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('voice_mode.log')
    ]
)

logger = logging.getLogger(__name__)

class VoiceModeManager:
    """Main manager class for voice mode operations"""
    
    def __init__(self):
        self.is_initialized = False
        self.cli_mode = False
        
    def initialize(self, config: Optional[Dict[str, Any]] = None) -> bool:
        """Initialize voice mode system"""
        try:
            logger.info("Initializing voice mode system...")
            
            # Apply configuration if provided
            if config:
                voice_config = VoiceConfig(
                    enable_stt=config.get('enable_stt', True),
                    enable_tts=config.get('enable_tts', True),
                    silence_threshold=config.get('silence_threshold', 1.5),
                    wake_word=config.get('wake_word'),
                    auto_respond=config.get('auto_respond', True),
                    continuous_mode=config.get('continuous_mode', False)
                )
                voice_interface.config = voice_config
            
            # Initialize audio devices
            if not audio_manager.select_devices():
                logger.error("Failed to initialize audio devices")
                return False
            
            # Set up callbacks
            voice_interface.set_callbacks(
                speech_callback=self._on_speech_recognized,
                response_callback=self._on_response_generated,
                mode_change_callback=self._on_mode_change
            )
            
            self.is_initialized = True
            logger.info("Voice mode system initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Initialization failed: {e}")
            return False
    
    def _on_speech_recognized(self, text: str) -> Optional[str]:
        """Handle recognized speech - integrate with main system"""
        logger.info(f"🎤 Recognized: {text}")
        
        # In a real implementation, this would communicate with the main LLM
        # For now, we'll provide simple responses
        response = self._generate_response(text)
        return response
    
    def _generate_response(self, text: str) -> str:
        """Generate response to recognized speech"""
        text_lower = text.lower().strip()
        
        # Simple response logic - would be replaced by actual LLM integration
        if any(word in text_lower for word in ['hello', 'hi', 'hey']):
            return "Hello! How can I help you today?"
        elif 'how are you' in text_lower:
            return "I'm doing well, thank you for asking!"
        elif 'what time' in text_lower:
            return f"The current time is {time.strftime('%I:%M %p')}."
        elif 'thank' in text_lower:
            return "You're welcome!"
        elif any(word in text_lower for word in ['bye', 'goodbye', 'see you']):
            return "Goodbye! Feel free to speak to me anytime."
        else:
            return f"I heard you say: {text}. This is a demo response."
    
    def _on_response_generated(self, response: str):
        """Handle generated responses"""
        logger.info(f"🔊 Speaking: {response}")
    
    def _on_mode_change(self, old_mode, new_mode):
        """Handle mode changes"""
        logger.debug(f"🔄 Mode changed: {old_mode.value} -> {new_mode.value}")
        
        # Print mode changes in CLI mode
        if self.cli_mode:
            mode_descriptions = {
                'inactive': '🔇 Inactive',
                'listening': '👂 Listening',
                'processing': '⚙️  Processing',
                'speaking': '🔊 Speaking'
            }
            print(f"{mode_descriptions.get(new_mode.value, new_mode.value)}")
    
    def start_voice_mode(self, cli_mode: bool = False) -> bool:
        """Start voice mode"""
        if not self.is_initialized:
            logger.error("System not initialized")
            return False
            
        self.cli_mode = cli_mode
        
        try:
            logger.info("Starting voice mode...")
            success = voice_interface.start()
            
            if success and cli_mode:
                print("🎤 Voice mode started!")
                print("Speak into your microphone...")
                print("Commands:")
                print("  - Say 'stop voice' to exit")
                print("  - Say anything else to chat")
                print("")
            
            return success
            
        except Exception as e:
            logger.error(f"Failed to start voice mode: {e}")
            return False
    
    def stop_voice_mode(self):
        """Stop voice mode"""
        try:
            logger.info("Stopping voice mode...")
            voice_interface.stop()
            
            if self.cli_mode:
                print("🛑 Voice mode stopped")
                
        except Exception as e:
            logger.error(f"Error stopping voice mode: {e}")
    
    def speak_text(self, text: str, wait: bool = True) -> bool:
        """Speak text through TTS"""
        return voice_interface.speak(text, wait)
    
    def get_status(self) -> Dict[str, Any]:
        """Get system status"""
        return voice_interface.get_status()

def main():
    """Main CLI entry point"""
    parser = argparse.ArgumentParser(description='Aud.io Voice Mode')
    parser.add_argument('--cli', action='store_true', help='Run in CLI mode')
    parser.add_argument('--start-api', action='store_true', help='Start REST API server')
    parser.add_argument('--api-host', default='127.0.0.1', help='API server host')
    parser.add_argument('--api-port', type=int, default=8002, help='API server port')
    parser.add_argument('--config', help='Path to configuration JSON file')
    parser.add_argument('--speak', help='Speak text and exit')
    parser.add_argument('--list-devices', action='store_true', help='List audio devices')
    parser.add_argument('--wake-word', help='Set wake word')
    
    args = parser.parse_args()
    
    # List devices if requested
    if args.list_devices:
        devices = audio_manager.list_devices()
        print("Input Devices:")
        for dev in devices['input_devices']:
            print(f"  {dev['id']}: {dev['name']} ({dev['sample_rates']})")
        print("\nOutput Devices:")
        for dev in devices['output_devices']:
            print(f"  {dev['id']}: {dev['name']} ({dev['sample_rates']})")
        return
    
    # Load configuration
    config = None
    if args.config:
        try:
            with open(args.config, 'r') as f:
                config = json.load(f)
        except Exception as e:
            logger.error(f"Failed to load config file: {e}")
            return
    
    # Initialize manager
    manager = VoiceModeManager()
    if not manager.initialize(config):
        print("❌ Failed to initialize voice mode")
        return
    
    # Speak text and exit if requested
    if args.speak:
        print(f"🔊 Speaking: {args.speak}")
        success = manager.speak_text(args.speak, wait=True)
        if success:
            print("✅ Spoken successfully")
        else:
            print("❌ Failed to speak")
        return
    
    # Start API server if requested
    if args.start_api:
        print(f"🌐 Starting API server on {args.api_host}:{args.api_port}")
        voice_api.start(host=args.api_host, port=args.api_port, debug=False)
    
    # Start voice mode
    if args.cli or not args.start_api:
        if not manager.start_voice_mode(cli_mode=args.cli):
            print("❌ Failed to start voice mode")
            if args.start_api:
                voice_api.stop()
            return
        
        # Set wake word if specified
        if args.wake_word:
            voice_interface.set_wake_word(args.wake_word)
            print(f"🎯 Wake word set to: '{args.wake_word}'")
        
        try:
            if args.cli:
                print("🎙️  Voice mode active. Press Ctrl+C to exit.")
                # Keep running in CLI mode
                while True:
                    time.sleep(1)
            else:
                # Just keep the API running
                while True:
                    time.sleep(1)
                    
        except KeyboardInterrupt:
            print("\n🛑 Shutting down...")
        finally:
            manager.stop_voice_mode()
            if args.start_api:
                voice_api.stop()
    
    print("👋 Goodbye!")

if __name__ == "__main__":
    main()