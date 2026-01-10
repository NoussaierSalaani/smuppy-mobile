import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, KeyboardAvoidingView, Platform, TouchableWithoutFeedback, Keyboard } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { COLORS } from '../../config/theme';
import { supabase } from '../../config/supabase';
import { SmuppyText } from '../../components/SmuppyLogo';
import ErrorModal from '../../components/ErrorModal';
import { validate, isPasswordValid, getPasswordStrengthLevel } from '../../utils/validation';

const FORM = {
  inputHeight: 50,
  inputRadius: 25,
  buttonHeight: 50,
  buttonRadius: 25,
};

const GoogleLogo = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24">
    <Path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <Path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <Path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
    <Path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
  </Svg>
);

export default function SignupScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorModal, setErrorModal] = useState({ visible: false, title: '', message: '' });

  const passwordValid = isPasswordValid(password);
  const strengthLevel = getPasswordStrengthLevel(password);
  const emailValid = validate.email(email);
  const isFormValid = emailValid && passwordValid && agreeTerms;

  const handleSignup = async () => {
    if (!isFormValid) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password });
      if (error) {
        let errorMessage = error.message;
        let errorTitle = 'Signup Failed';
        if (error.message.includes('already registered')) { errorTitle = 'Email Already Used'; errorMessage = 'This email is already registered. Please try logging in or use a different email.'; }
        else if (error.message.includes('invalid email')) { errorTitle = 'Invalid Email'; errorMessage = 'Please enter a valid email address.'; }
        setErrorModal({ visible: true, title: errorTitle, message: errorMessage });
      } else {
        navigation.navigate('VerifyCode', { email: email.trim().toLowerCase() });
      }
    } catch (err) {
      setErrorModal({ visible: true, title: 'Connection Error', message: 'Unable to connect to the server. Please check your internet connection and try again.' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <SafeAreaView style={styles.container}>
        <KeyboardAvoidingView 
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
          style={styles.keyboardView}
        >
          <View style={styles.content}>
            
            {/* Section 1: Header */}
            <View style={styles.section}>
              <Text style={styles.title}>Create an Account</Text>
              <Text style={styles.subtitle}>A platform to connect, inspire, track and have fun</Text>
            </View>

            {/* Section 2: Email */}
            <View style={styles.section}>
              <Text style={styles.label}>Email address</Text>
              <View style={[
                styles.inputBox, 
                emailFocused && styles.inputFocused,
                email.length > 0 && !emailValid && styles.inputError,
                email.length > 0 && emailValid && styles.inputValid,
              ]}>
                <Ionicons name="mail-outline" size={18} color={email.length > 0 && !emailValid ? '#FF3B30' : emailFocused ? '#00cdb5' : '#9cadbc'} />
                <TextInput 
                  style={styles.input} 
                  placeholder="mailusersmuppy@mail.com" 
                  placeholderTextColor="#9cadbc" 
                  value={email} 
                  onChangeText={setEmail} 
                  keyboardType="email-address" 
                  autoCapitalize="none" 
                  autoCorrect={false}
                  onFocus={() => setEmailFocused(true)}
                  onBlur={() => setEmailFocused(false)}
                />
                {email.length > 0 && emailValid && <Ionicons name="checkmark-circle" size={18} color="#00cdb5" />}
              </View>
            </View>

            {/* Section 3: Password */}
            <View style={styles.section}>
              <Text style={styles.label}>Password</Text>
              <View style={[
                styles.inputBox, 
                passwordFocused && styles.inputFocused,
                password.length > 0 && !passwordValid && styles.inputError,
                password.length > 0 && passwordValid && styles.inputValid,
              ]}>
                <Ionicons name="lock-closed-outline" size={18} color={password.length > 0 && !passwordValid ? '#FF3B30' : passwordFocused ? '#00cdb5' : '#9cadbc'} />
                <TextInput 
                  style={styles.input} 
                  placeholder="••••••••••" 
                  placeholderTextColor="#9cadbc" 
                  value={password} 
                  onChangeText={setPassword} 
                  secureTextEntry={!showPassword} 
                  onFocus={() => setPasswordFocused(true)} 
                  onBlur={() => setPasswordFocused(false)} 
                />
                <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                  <Ionicons name={showPassword ? "eye-outline" : "eye-off-outline"} size={18} color="#9cadbc" />
                </TouchableOpacity>
              </View>
              {/* Password Strength */}
              {password.length > 0 && (
                <View style={styles.strengthContainer}>
                  <View style={styles.strengthBarBg}>
                    <View style={[styles.strengthBar, { width: strengthLevel.level === 'weak' ? '25%' : strengthLevel.level === 'medium' ? '50%' : strengthLevel.level === 'strong' ? '75%' : '100%', backgroundColor: strengthLevel.color }]} />
                  </View>
                  <Text style={[styles.strengthText, { color: strengthLevel.color }]}>{strengthLevel.label}</Text>
                </View>
              )}
            </View>

            {/* Section 4: Signup Button */}
            <View style={styles.section}>
              <LinearGradient
                colors={isFormValid ? ['#00cdb5', '#0066ac'] : ['#CED3D5', '#CED3D5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.btn}
              >
                <TouchableOpacity
                  style={styles.btnInner}
                  onPress={handleSignup}
                  disabled={!isFormValid || loading}
                  activeOpacity={0.8}
                >
                  <Text style={styles.btnText}>{loading ? 'Creating account...' : 'Set-up your account'}</Text>
                  {!loading && <Ionicons name="arrow-forward" size={18} color={COLORS.white} />}
                </TouchableOpacity>
              </LinearGradient>
            </View>

            {/* Section 5: Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>Or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Section 6: Social Buttons */}
            <View style={styles.section}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
                <GoogleLogo size={20} />
                <Text style={styles.socialBtnText}>Continue with Google</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.section}>
              <TouchableOpacity style={styles.socialBtn} activeOpacity={0.7}>
                <Ionicons name="logo-apple" size={22} color="#0a252f" />
                <Text style={styles.socialBtnText}>Continue with Apple</Text>
              </TouchableOpacity>
            </View>

            {/* Section 7: Login Link */}
            <View style={styles.section}>
              <View style={styles.loginRow}>
                <Text style={styles.loginText}>Already have an account? </Text>
                <TouchableOpacity onPress={() => navigation.navigate('Login')} style={styles.loginLinkRow}>
                  <Text style={styles.loginLink}>Log In</Text>
                  <Ionicons name="arrow-forward" size={12} color="#00cdb5" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Section 8: Terms */}
            <View style={styles.section}>
              <TouchableOpacity style={styles.termsRow} onPress={() => setAgreeTerms(!agreeTerms)} activeOpacity={0.7}>
                <View style={[styles.checkbox, agreeTerms && styles.checkboxChecked]}>
                  {agreeTerms && <Ionicons name="checkmark" size={11} color={COLORS.white} />}
                </View>
                <Text style={styles.termsText}>I agree to the <Text style={styles.termsLink}>Terms and Conditions</Text> and <Text style={styles.termsLink}>Privacy Policy</Text>.</Text>
              </TouchableOpacity>
            </View>

            {/* Section 9: Footer */}
            <View style={styles.section}>
              <View style={styles.footer}>
                <SmuppyText width={90} variant="dark" />
              </View>
            </View>

          </View>
        </KeyboardAvoidingView>

        <ErrorModal visible={errorModal.visible} onClose={() => setErrorModal({ ...errorModal, visible: false })} title={errorModal.title} message={errorModal.message} />
      </SafeAreaView>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: COLORS.white,
  },
  keyboardView: { 
    flex: 1,
  },
  content: { 
    flex: 1,
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  
  // Chaque section prend une part égale de l'espace
  section: {
    flex: 1,
    justifyContent: 'center',
  },
  
  // Header
  title: { 
    fontFamily: 'WorkSans-Bold', 
    fontSize: 24, 
    color: '#0a252f', 
    textAlign: 'center',
  },
  subtitle: { 
    fontSize: 12, 
    color: '#676C75', 
    textAlign: 'center',
    marginTop: 4,
  },
  
  // Form
  label: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#0a252f', 
    marginBottom: 6,
  },
  inputBox: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    height: FORM.inputHeight, 
    borderWidth: 1.5, 
    borderColor: '#CED3D5', 
    borderRadius: FORM.inputRadius, 
    paddingHorizontal: 16, 
    backgroundColor: COLORS.white,
  },
  inputFocused: {
    borderColor: '#00cdb5',
    backgroundColor: '#F0FDFB',
  },
  inputValid: {
    borderColor: '#00cdb5',
    backgroundColor: '#E6FAF8',
  },
  inputError: { 
    borderColor: '#FF3B30',
    backgroundColor: '#FEF2F2',
  },
  input: { 
    flex: 1, 
    fontSize: 14, 
    color: '#0a252f', 
    marginLeft: 10,
  },
  
  // Password Strength
  strengthContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    marginTop: 8, 
    gap: 8,
  },
  strengthBarBg: { 
    flex: 1, 
    height: 3, 
    backgroundColor: '#E5E7EB', 
    borderRadius: 2, 
    overflow: 'hidden',
  },
  strengthBar: { 
    height: '100%', 
    borderRadius: 2,
  },
  strengthText: { 
    fontSize: 10, 
    fontWeight: '600', 
    minWidth: 55,
  },
  
  // Button
  btn: { 
    height: FORM.buttonHeight, 
    borderRadius: FORM.buttonRadius,
  },
  btnInner: { 
    flex: 1, 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center', 
    gap: 6,
  },
  btnText: { 
    color: COLORS.white, 
    fontSize: 14, 
    fontWeight: '600',
  },
  
  // Divider
  dividerRow: { 
    flexDirection: 'row', 
    alignItems: 'center',
    paddingVertical: 4,
  },
  dividerLine: { 
    flex: 1, 
    height: 1, 
    backgroundColor: '#E5E7EB',
  },
  dividerText: { 
    paddingHorizontal: 10, 
    fontSize: 11, 
    color: '#676C75',
  },
  
  // Social Buttons
  socialBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'center', 
    height: FORM.buttonHeight, 
    borderWidth: 1.5, 
    borderColor: '#E5E7EB', 
    borderRadius: FORM.buttonRadius, 
    backgroundColor: COLORS.white,
    gap: 8,
  },
  socialBtnText: { 
    fontSize: 13, 
    fontWeight: '500', 
    color: '#0a252f',
  },
  
  // Login Row
  loginRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    alignItems: 'center',
  },
  loginText: { 
    fontSize: 12, 
    color: '#676C75',
  },
  loginLinkRow: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 3,
  },
  loginLink: { 
    fontSize: 12, 
    fontWeight: '600', 
    color: '#00cdb5',
  },
  
  // Terms
  termsRow: { 
    flexDirection: 'row', 
    alignItems: 'flex-start',
  },
  checkbox: { 
    width: 18, 
    height: 18, 
    borderWidth: 1.5, 
    borderColor: '#CED3D5', 
    borderRadius: 4, 
    marginRight: 8, 
    justifyContent: 'center', 
    alignItems: 'center', 
    backgroundColor: COLORS.white,
  },
  checkboxChecked: { 
    backgroundColor: '#00cdb5', 
    borderColor: '#00cdb5',
  },
  termsText: { 
    flex: 1, 
    fontSize: 10, 
    color: '#676C75', 
    lineHeight: 14,
  },
  termsLink: { 
    color: '#00cdb5', 
    fontWeight: '500',
  },
  
  // Footer
  footer: { 
    alignItems: 'center',
  },
});